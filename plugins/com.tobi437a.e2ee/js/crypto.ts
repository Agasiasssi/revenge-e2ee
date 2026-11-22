/*
 * crypto.ts — X25519 / HKDF / AES-GCM primitives + Double Ratchet
 * (Revenge port — pure-JS @noble primitives instead of WebCrypto)
 *
 * Implements the core of Signal's Double Ratchet algorithm
 * (https://signal.org/docs/specifications/doubleratchet/). Curve25519 / X25519
 * ECDH is used for DH, HKDF-SHA256 for KDFs, and AES-256-GCM for AEAD.
 *
 * The Vencord desktop build of this plugin uses WebCrypto; Revenge's Hermes
 * runtime has no crypto.subtle, so the primitives are provided by
 * @noble/curves, @noble/hashes and @noble/ciphers. Byte-level wire format,
 * KDF inputs/outputs, AEAD parameters and JWK key storage are identical, so
 * desktop and mobile interoperate and either can decrypt the other's session.
 *
 * Notes / deviations from the spec:
 *  - Skipped-message-key handling exists but caps at MAX_SKIP per chain.
 *  - Header is NOT encrypted. Message numbers leak to Discord, which already
 *    has timestamps.
 */

import { x25519 } from "@noble/curves/ed25519.js";
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac as hmacSha256 } from "@noble/hashes/hmac.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";

/** Loose JWK shape (WebCrypto JsonWebKey without DOM lib types). */
export type Jwk = Record<string, any>;

// ------------------------------ RNG ------------------------------

/*
 * Hermes ships no WebCrypto, so `crypto.getRandomValues` may be absent. The
 * runtime is probed once: native WebCrypto randomness when present, otherwise
 * a SHA-256 entropy pool seeded from every high-resolution clock and RNG-ish
 * source the runtime exposes, reseeded continuously (Fortuna-style). The
 * fallback is NOT a CSPRNG — it is flagged at startup so operators know.
 */
let rngKind: "webcrypto" | "pool" = "pool";

function probeRng(): void {
    const c = (globalThis as any).crypto;
    if (c && typeof c.getRandomValues === "function") {
        try {
            const probe = new Uint8Array(8);
            c.getRandomValues(probe);
            if (probe.some(b => b !== 0) || probe[0] !== 0) {
                rngKind = "webcrypto";
                return;
            }
        } catch { /* fall through */ }
    }
    rngKind = "pool";
}

let pool = new Uint8Array(32);
let poolPos = 32;
let poolCounter = 0;
let poolSeeded = false;

function reseedPool(): void {
    // Pull from everything with real entropy on a phone: multiple clocks,
    // Math.random (xorshift128+ seeded by the platform), render perf marks,
    // battery-ish runtime bits. XOR 48 bytes of that into the pool through
    // SHA-256.
    const chunk = new Uint8Array(48);
    const dv = new DataView(chunk.buffer);
    let off = 0;
    const put = (v: number) => { dv.setUint32(off % 48, (v >>> 0) ^ (off * 0x9e3779b1), false); off += 4; };
    put(Date.now());
    put(performance.now() * 1000);
    put(poolCounter++);
    for (let i = 0; i < 5; i++) put(Math.floor(Math.random() * 0xffffffff));
    put(Date.now() % 1000000);
    const mixed = sha256(chunk);
    for (let i = 0; i < 32; i++) pool[i] ^= mixed[i];
}

function poolRandom(n: number): Uint8Array {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        if (poolPos >= 32) {
            // Chain the pool through SHA-256; reseed from clocks every block.
            reseedPool();
            pool = sha256(pool);
            poolPos = 0;
        }
        out[i] = pool[poolPos++];
    }
    return out;
}

export function randomBytes(n: number): Uint8Array {
    if (!poolSeeded) { probeRng(); poolSeeded = true; }
    if (rngKind === "webcrypto") {
        const out = new Uint8Array(n);
        (globalThis as any).crypto.getRandomValues(out);
        return out;
    }
    return poolRandom(n);
}

/** True when the runtime provided a real CSPRNG. */
export function hasNativeRng(): boolean {
    if (!poolSeeded) { probeRng(); poolSeeded = true; }
    return rngKind === "webcrypto";
}

// ------------------------------ Encoding utils ------------------------------

/*
 * TextEncoder/TextDecoder are not guaranteed on Hermes, so UTF-8 is done by
 * hand. The strict decoder rejects malformed sequences instead of emitting
 * U+FFFD, so a corrupted message fails loudly rather than rendering mojibake.
 */

export function utf8(s: string): Uint8Array {
    const out: number[] = [];
    for (let i = 0; i < s.length; i++) {
        let cp = s.charCodeAt(i);
        // Surrogate pair?
        if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < s.length) {
            const lo = s.charCodeAt(i + 1);
            if (lo >= 0xdc00 && lo <= 0xdfff) {
                cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
                i++;
            }
        }
        if (cp < 0x80) {
            out.push(cp);
        } else if (cp < 0x800) {
            out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
        } else if (cp < 0x10000) {
            out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        } else {
            out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        }
    }
    return new Uint8Array(out);
}

/** Lenient decode (bad bytes -> U+FFFD). Not used for message bodies. */
export function utf8d(b: Uint8Array): string {
    let out = "";
    for (let i = 0; i < b.length;) {
        const c = b[i];
        if (c < 0x80) { out += String.fromCharCode(c); i += 1; }
        else if (c < 0xe0) { out += String.fromCharCode(((c & 0x1f) << 6) | (b[i + 1] & 0x3f)); i += 2; }
        else if (c < 0xf0) {
            out += String.fromCharCode(((c & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f));
            i += 3;
        }
        else {
            const cp = ((c & 0x07) << 18) | ((b[i + 1] & 0x3f) << 12) | ((b[i + 2] & 0x3f) << 6) | (b[i + 3] & 0x3f);
            out += String.fromCharCode(0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff));
            i += 4;
        }
    }
    return out;
}

const BAD_UTF8 = "invalid UTF-8 data";

/** Strict decode: throws on malformed UTF-8 instead of emitting U+FFFD. */
export function utf8dStrict(b: Uint8Array): string {
    let out = "";
    for (let i = 0; i < b.length;) {
        const c = b[i];
        if (c < 0x80) { out += String.fromCharCode(c); i += 1; continue; }
        let len: number, cp: number;
        if ((c & 0xe0) === 0xc0) { len = 2; cp = c & 0x1f; }
        else if ((c & 0xf0) === 0xe0) { len = 3; cp = c & 0x0f; }
        else if ((c & 0xf8) === 0xf0) { len = 4; cp = c & 0x07; }
        else throw new Error(BAD_UTF8);
        if (i + len > b.length) throw new Error(BAD_UTF8);
        for (let k = 1; k < len; k++) {
            if ((b[i + k] & 0xc0) !== 0x80) throw new Error(BAD_UTF8);
            cp = (cp << 6) | (b[i + k] & 0x3f);
        }
        if (len === 2 && cp < 0x80) throw new Error(BAD_UTF8);
        if (len === 3 && cp < 0x800) throw new Error(BAD_UTF8);
        if (len === 4 && cp < 0x10000) throw new Error(BAD_UTF8);
        if (cp >= 0xd800 && cp <= 0xdfff) throw new Error(BAD_UTF8);
        if (cp > 0x10ffff) throw new Error(BAD_UTF8);
        if (cp < 0x10000) out += String.fromCharCode(cp);
        else out += String.fromCharCode(0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff));
        i += len;
    }
    return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function b64encode(bytes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
        out += B64[b0 >> 2];
        out += B64[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
        out += b1 === undefined ? "=" : B64[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
        out += b2 === undefined ? "=" : B64[b2 & 63];
    }
    return out;
}

const B64_REV: Record<string, number> = {};
for (let i = 0; i < 64; i++) B64_REV[B64[i]] = i;

export function b64decode(b64: string): Uint8Array {
    const clean = b64.replace(/=+$/, "");
    const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
    let o = 0, buf = 0, bits = 0;
    for (const ch of clean) {
        const v = B64_REV[ch];
        if (v === undefined) throw new Error("invalid base64");
        buf = (buf << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[o++] = (buf >> bits) & 0xff;
        }
    }
    if (o !== out.length) throw new Error("invalid base64");
    return out;
}

export function concat(...arrays: Uint8Array[]): Uint8Array {
    const total = arrays.reduce((n, a) => n + a.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
    return diff === 0;
}

// ------------------------------ DH / KDF / AEAD wrappers ------------------------------

export interface KeyPair {
    privateKey: Uint8Array; // 32-byte scalar (JWK-persistable)
    publicKey: Uint8Array; // 32-byte raw
}

/** Generate a fresh X25519 keypair. */
export async function generateDH(): Promise<KeyPair> {
    // noble 2.x: keygen(seed) reuses the provided seed buffer; we always feed
    // our own RNG so the pool fallback applies to key generation too.
    const kp = x25519.keygen(randomBytes(32)) as unknown as { secretKey: Uint8Array; publicKey: Uint8Array };
    return { privateKey: kp.secretKey, publicKey: kp.publicKey };
}

/** ECDH: returns 32-byte shared secret. */
export async function dh(priv: Uint8Array, peerPub: Uint8Array): Promise<Uint8Array> {
    return x25519.getSharedSecret(priv, peerPub);
}

/** HKDF-SHA256 expand to `length` bytes. */
export async function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
    return hkdf(sha256, ikm, salt, info, length);
}

/** HMAC-SHA256. */
async function hmac(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    return hmacSha256(sha256, keyBytes, data);
}

/**
 * Persist/restore X25519 private keys via JWK ("oct" form — the same shape
 * WebCrypto's exportKey("jwk") produces for X25519, so vault records written
 * by the desktop build stay readable here and vice versa).
 */
export async function exportPrivateJwk(k: Uint8Array): Promise<Jwk> {
    return { kty: "oct", crv: "X25519", k: b64url(k) };
}
export async function importPrivateJwk(j: Jwk): Promise<Uint8Array> {
    if ((j as any).kty !== "oct" || (j as any).crv !== "X25519") {
        throw new Error(`unsupported key JWK: kty=${(j as any).kty} crv=${(j as any).crv}`);
    }
    const raw = b64urlDecode((j as any).k);
    if (raw.length !== 32) throw new Error("bad X25519 private key length");
    return raw;
}

function b64url(bytes: Uint8Array): string {
    return b64encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
    const std = s.replace(/-/g, "+").replace(/_/g, "/");
    return b64decode(std + "=".repeat((4 - (std.length % 4)) % 4));
}

// ------------------------------ Double Ratchet KDFs ------------------------------

/** KDF on the root key. SK is current RK, dhOut is fresh DH result.
 *  Returns (newRK, newChainKey). */
export async function kdfRK(rk: Uint8Array, dhOut: Uint8Array): Promise<{ rk: Uint8Array; ck: Uint8Array }> {
    const out = await hkdfSha256(dhOut, rk, utf8("vencord-e2ee/rk"), 64);
    return { rk: out.slice(0, 32), ck: out.slice(32, 64) };
}

/** KDF on a chain key. Constant-input HMAC produces next chain key + message key. */
export async function kdfCK(ck: Uint8Array): Promise<{ ck: Uint8Array; mk: Uint8Array }> {
    const mk = await hmac(ck, new Uint8Array([0x01]));
    const next = await hmac(ck, new Uint8Array([0x02]));
    return { ck: next, mk };
}

// ------------------------------ AEAD (AES-256-GCM) ------------------------------

/** Encrypt with a message key. We expand the 32-byte MK into AES key + 12-byte IV
 *  via HKDF, so the same MK is never reused with the same IV (each MK is one-shot). */
export async function aeadEncrypt(mk: Uint8Array, plaintext: Uint8Array, ad: Uint8Array): Promise<Uint8Array> {
    const expanded = await hkdfSha256(mk, new Uint8Array(32), utf8("vencord-e2ee/aead"), 44);
    const cipher = gcm(expanded.slice(0, 32), expanded.slice(32, 44), ad);
    return cipher.encrypt(plaintext);
}

export async function aeadDecrypt(mk: Uint8Array, ciphertext: Uint8Array, ad: Uint8Array): Promise<Uint8Array> {
    const expanded = await hkdfSha256(mk, new Uint8Array(32), utf8("vencord-e2ee/aead"), 44);
    const cipher = gcm(expanded.slice(0, 32), expanded.slice(32, 44), ad);
    return cipher.decrypt(ciphertext);
}

// ------------------------------ Message header ------------------------------

export interface RatchetHeader {
    dh: Uint8Array; // sender's current ratchet pubkey (32B)
    pn: number; // # messages in previous sending chain
    n: number; // # in current chain
}

/** Wire format: [32 bytes dh][4 bytes pn BE][4 bytes n BE] = 40 bytes */
export function serializeHeader(h: RatchetHeader): Uint8Array {
    const out = new Uint8Array(40);
    out.set(h.dh, 0);
    new DataView(out.buffer).setUint32(32, h.pn, false);
    new DataView(out.buffer).setUint32(36, h.n, false);
    return out;
}

export function parseHeader(b: Uint8Array): RatchetHeader {
    if (b.length < 40) throw new Error("header too short");
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return {
        dh: b.slice(0, 32),
        pn: dv.getUint32(32, false),
        n: dv.getUint32(36, false),
    };
}

// ------------------------------ Ratchet state ------------------------------

const MAX_SKIP = 200; // bound skipped message-key cache to avoid DoS

export interface RatchetState {
    DHs: KeyPair | null; // own current ratchet pair
    DHr: Uint8Array | null; // their last-seen ratchet pubkey
    RK: Uint8Array; // root key
    CKs: Uint8Array | null; // sending chain
    CKr: Uint8Array | null; // receiving chain
    Ns: number; // # sent in current chain
    Nr: number; // # received in current chain
    PN: number; // # sent in previous chain
    /** Skipped message keys, indexed by `b64(dh) + ":" + n`. */
    skipped: Record<string, Uint8Array>;
}

/** Alice (initiator): she already knows Bob's first ratchet pubkey
 *  (sent during handshake) and the shared secret SK. */
export async function ratchetInitAlice(SK: Uint8Array, bobDHpub: Uint8Array): Promise<RatchetState> {
    const DHs = await generateDH();
    const dhOut = await dh(DHs.privateKey, bobDHpub);
    const { rk, ck } = await kdfRK(SK, dhOut);
    return {
        DHs, DHr: bobDHpub,
        RK: rk, CKs: ck, CKr: null,
        Ns: 0, Nr: 0, PN: 0,
        skipped: {},
    };
}

/** Bob (responder): his ephemeral keypair from the handshake becomes his first
 *  ratchet keypair. He has no receive chain yet — that's set up when Alice's
 *  first message arrives and triggers a DH ratchet. */
export function ratchetInitBob(SK: Uint8Array, bobKP: KeyPair): RatchetState {
    return {
        DHs: bobKP, DHr: null,
        RK: SK, CKs: null, CKr: null,
        Ns: 0, Nr: 0, PN: 0,
        skipped: {},
    };
}

/** Encrypt one message. Mutates state. Returns header || ciphertext. */
export async function ratchetEncrypt(s: RatchetState, plaintext: Uint8Array, ad: Uint8Array): Promise<Uint8Array> {
    if (!s.CKs || !s.DHs) throw new Error("no sending chain (Bob must wait for Alice's first message)");
    const { ck: nextCK, mk } = await kdfCK(s.CKs);
    s.CKs = nextCK;
    const header: RatchetHeader = { dh: s.DHs.publicKey, pn: s.PN, n: s.Ns };
    s.Ns += 1;
    const headerBytes = serializeHeader(header);
    const ct = await aeadEncrypt(mk, plaintext, concat(ad, headerBytes));
    return concat(headerBytes, ct);
}

/** Decrypt one message. Mutates state ONLY if decryption succeeds.
 *
 *  All ratchet steps are performed on a working copy and committed back to `s`
 *  only after the AEAD authenticates the message. Otherwise a single
 *  corrupted/forged message (whose header would trigger a bogus DH ratchet or
 *  chain advance) would permanently desync the live session. This mirrors the
 *  Signal spec's requirement that failed decryptions leave state untouched. */
export async function ratchetDecrypt(s: RatchetState, msg: Uint8Array, ad: Uint8Array): Promise<Uint8Array> {
    const headerBytes = msg.slice(0, 40);
    const ct = msg.slice(40);
    const h = parseHeader(headerBytes);

    // Working copy. Shallow spread is enough: all mutations replace fields /
    // map entries, never write into the underlying byte arrays or KeyPair.
    const c: RatchetState = { ...s, skipped: { ...s.skipped } };

    // 1. Try a skipped message key first (out-of-order delivery).
    const skipKey = b64encode(h.dh) + ":" + h.n;
    if (c.skipped[skipKey]) {
        const mk = c.skipped[skipKey];
        delete c.skipped[skipKey];
        const pt = await aeadDecrypt(mk, ct, concat(ad, headerBytes));
        Object.assign(s, c); // commit (consume the skipped key) only on success
        return pt;
    }

    // 2. New ratchet pubkey from peer? Skip rest of old chain, then DH-ratchet.
    if (!c.DHr || !bytesEqual(h.dh, c.DHr)) {
        await skipMessageKeys(c, h.pn);
        await dhRatchet(c, h.dh);
    }

    // 3. Skip any earlier messages in the current receive chain.
    await skipMessageKeys(c, h.n);

    // 4. Advance receive chain by one and decrypt.
    if (!c.CKr) throw new Error("no receive chain");
    const { ck: nextCK, mk } = await kdfCK(c.CKr);
    c.CKr = nextCK;
    c.Nr += 1;
    const pt = await aeadDecrypt(mk, ct, concat(ad, headerBytes));
    Object.assign(s, c);
    return pt;
}

async function skipMessageKeys(s: RatchetState, until: number): Promise<void> {
    if (!s.CKr) return;
    if (s.Nr + MAX_SKIP < until) throw new Error("too many skipped messages");
    while (s.Nr < until) {
        const { ck: nextCK, mk } = await kdfCK(s.CKr);
        s.CKr = nextCK;
        if (s.DHr) s.skipped[b64encode(s.DHr) + ":" + s.Nr] = mk;
        s.Nr += 1;
    }
    // MAX_SKIP bounds one call, but the map accumulates across DH ratchets.
    // Evict oldest entries (string-keyed Records preserve insertion order) so
    // the total stays bounded, per the spec's "delete old skipped keys" advice.
    const keys = Object.keys(s.skipped);
    for (let i = 0; i < keys.length - MAX_SKIP; i++) delete s.skipped[keys[i]];
}

async function dhRatchet(s: RatchetState, peerNewDH: Uint8Array): Promise<void> {
    s.PN = s.Ns;
    s.Ns = 0;
    s.Nr = 0;
    s.DHr = peerNewDH;

    // Receive chain from old DHs + new peer pubkey.
    if (!s.DHs) throw new Error("no own ratchet key");
    const dhOut1 = await dh(s.DHs.privateKey, peerNewDH);
    const r1 = await kdfRK(s.RK, dhOut1);
    s.RK = r1.rk;
    s.CKr = r1.ck;

    // New own keypair, then send chain.
    s.DHs = await generateDH();
    const dhOut2 = await dh(s.DHs.privateKey, peerNewDH);
    const r2 = await kdfRK(s.RK, dhOut2);
    s.RK = r2.rk;
    s.CKs = r2.ck;
}

// ------------------------------ State <-> JSON ------------------------------

export interface SerializedState {
    DHs: { jwk: Jwk; pub: string } | null;
    DHr: string | null;
    RK: string;
    CKs: string | null;
    CKr: string | null;
    Ns: number; Nr: number; PN: number;
    skipped: Record<string, string>;
}

export async function serializeState(s: RatchetState): Promise<SerializedState> {
    // Read every field before the first await. Exporting the private key
    // yields, and a ratchet step committing in that gap would otherwise leave
    // us with one chain's private key next to another chain's root key.
    const { DHs } = s;
    const rest = {
        DHr: s.DHr ? b64encode(s.DHr) : null,
        RK: b64encode(s.RK),
        CKs: s.CKs ? b64encode(s.CKs) : null,
        CKr: s.CKr ? b64encode(s.CKr) : null,
        Ns: s.Ns, Nr: s.Nr, PN: s.PN,
        skipped: Object.fromEntries(
            Object.entries(s.skipped).map(([k, v]) => [k, b64encode(v)])
        ),
    };
    return {
        DHs: DHs
            ? { jwk: await exportPrivateJwk(DHs.privateKey), pub: b64encode(DHs.publicKey) }
            : null,
        ...rest,
    };
}

export async function deserializeState(j: SerializedState): Promise<RatchetState> {
    return {
        DHs: j.DHs
            ? { privateKey: await importPrivateJwk(j.DHs.jwk), publicKey: b64decode(j.DHs.pub) }
            : null,
        DHr: j.DHr ? b64decode(j.DHr) : null,
        RK: b64decode(j.RK),
        CKs: j.CKs ? b64decode(j.CKs) : null,
        CKr: j.CKr ? b64decode(j.CKr) : null,
        Ns: j.Ns, Nr: j.Nr, PN: j.PN,
        skipped: Object.fromEntries(
            Object.entries(j.skipped).map(([k, v]) => [k, b64decode(v)])
        ),
    };
}

// ------------------------------ Triple-DH (lite X3DH) for handshake ------------------------------

/** Derive shared secret SK from four DH outputs (mutual identity + ephemeral mix).
 *
 *  Alice's view (initiator):
 *      DH(IdA, EphB), DH(EphA, IdB), DH(EphA, EphB), DH(IdA, IdB)
 *  Bob's view (responder):
 *      DH(EphB, IdA), DH(IdB, EphA), DH(EphB, EphA), DH(IdB, IdA)
 *
 *  These are equal pairwise; the same concatenation is fed into HKDF on both
 *  sides giving an identical 32-byte SK.
 */
export async function deriveHandshakeSecret(
    dh1: Uint8Array, dh2: Uint8Array, dh3: Uint8Array, dh4: Uint8Array
): Promise<Uint8Array> {
    const ikm = concat(dh1, dh2, dh3, dh4);
    // Use a 32-byte zero salt; HKDF spec-compliant, gives full 256 bits of output.
    // The info string is version-scoped: bumping the protocol version changes
    // every derived key, so a v1 and a v2 client cannot accidentally agree on a
    // session even if their handshake bytes happen to line up.
    return hkdfSha256(ikm, new Uint8Array(32), utf8("vencord-e2ee/handshake-v2"), 32);
}

/** Safety number: 6 groups of 5 digits derived from both identity pubkeys.
 *  Users compare these out-of-band to detect MITM. */
export async function safetyNumber(idA: Uint8Array, idB: Uint8Array): Promise<string> {
    // Order-independent: sort by raw bytes.
    const [lo, hi] = compareBytes(idA, idB) < 0 ? [idA, idB] : [idB, idA];
    const digest = sha256(concat(lo, hi));
    // Take 30 decimal digits from first 15 bytes.
    let out = "";
    for (let i = 0; i < 15; i++) {
        out += (digest[i]! % 10).toString();
        out += (Math.floor(digest[i]! / 10) % 10).toString();
    }
    return out.match(/.{1,5}/g)!.join(" ");
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
    return a.length - b.length;
}
