/*
 * vault.ts — passphrase-based encryption for the plugin's own stored data.
 * (Revenge port — PBKDF2/AES-GCM via @noble instead of WebCrypto)
 *
 * Everything this plugin persists to storage is, by default, in the clear:
 * the long-term identity private key, live ratchet state (root keys, chain
 * keys, cached skipped message keys) and the decrypted plaintext of every
 * message you have read. Anyone with read access to the app's data directory
 * gets all of it. The vault wraps those records in AES-256-GCM under a key
 * derived from a passphrase that is never stored.
 *
 * What this does and does not buy you
 * -----------------------------------
 * It protects data at rest. It does NOT protect against anything running as
 * you while Discord is open: the derived key is held in memory for the
 * lifetime of the session, because the plugin has to decrypt incoming messages
 * without prompting on every keystroke.
 *
 * On the KDF
 * ----------
 * PBKDF2-SHA256 at 600k iterations (OWASP's 2023 floor). On the desktop build
 * this runs natively in WebCrypto; here it is @noble/hashes pbkdf2 in
 * JavaScript, so an unlock takes a few seconds on a phone rather than a few
 * hundred milliseconds. Its weakness versus Argon2id is memory-hardness: PBKDF2
 * parallelises well on GPUs, so a strong passphrase matters much more here
 * than it would with Argon2id. The UI enforces a length minimum for that
 * reason.
 *
 * The algorithm and its parameters are recorded in each stored blob rather
 * than assumed, so adding Argon2id later is a data migration (read old
 * descriptor, re-wrap under a new one) and not a redesign. `deriveVaultKey`
 * dispatches on the descriptor and rejects ones it doesn't recognise.
 */

import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";

import { randomBytes, b64decode, b64encode, utf8, utf8dStrict } from "./crypto";

// ------------------------------ Descriptors ------------------------------

export const KDF_PBKDF2_SHA256 = "PBKDF2-SHA256";

/** OWASP's 2023 minimum for PBKDF2-HMAC-SHA256. */
export const DEFAULT_PBKDF2_ITERATIONS = 600_000;

/** Refuse to derive from a stored descriptor weaker than this, so tampering
 *  with the on-disk parameters can't downgrade the KDF to a trivial cost. */
export const MIN_PBKDF2_ITERATIONS = 100_000;

export const SALT_BYTES = 16;
const IV_BYTES = 12;

/** How the vault key is derived. Stored alongside the data it protects. */
export interface VaultKdfParams {
    algorithm: typeof KDF_PBKDF2_SHA256;
    iterations: number;
    /** base64, `SALT_BYTES` bytes */
    salt: string;
}

/** One encrypted record. The marker field is what lets `readSecret` tell an
 *  encrypted store from a legacy plaintext one without a separate flag. */
export interface VaultBlob {
    __e2eeVault: true;
    v: 2;
    /** base64, `IV_BYTES` bytes */
    iv: string;
    /** base64 AES-GCM output (ciphertext ‖ 16-byte tag) */
    ct: string;
}

/** Vault-level metadata. Its presence is the authoritative signal that the
 *  stored data is encrypted — more reliable than the plugin setting, which
 *  records intent and can drift from reality if a migration is interrupted. */
export interface VaultMeta {
    kdf: VaultKdfParams;
    /** Encrypts `CHECK_PLAINTEXT`; lets us verify a passphrase without needing
     *  any user data to exist yet. */
    check: VaultBlob;
}

const CHECK_PLAINTEXT = "vencord-e2ee/vault-check/v2";

export class WrongPassphraseError extends Error {
    constructor() {
        super("wrong passphrase");
        this.name = "WrongPassphraseError";
    }
}

// ------------------------------ Type guards ------------------------------

export function isVaultBlob(value: unknown): value is VaultBlob {
    return typeof value === "object"
        && value !== null
        && (value as VaultBlob).__e2eeVault === true
        && typeof (value as VaultBlob).iv === "string"
        && typeof (value as VaultBlob).ct === "string";
}

export function isVaultMeta(value: unknown): value is VaultMeta {
    if (typeof value !== "object" || value === null) return false;
    const m = value as VaultMeta;
    return isVaultBlob(m.check)
        && typeof m.kdf === "object" && m.kdf !== null
        && typeof m.kdf.salt === "string"
        && typeof m.kdf.iterations === "number";
}

// ------------------------------ Key derivation ------------------------------

export function newKdfParams(iterations: number = DEFAULT_PBKDF2_ITERATIONS): VaultKdfParams {
    const salt = randomBytes(SALT_BYTES);
    return { algorithm: KDF_PBKDF2_SHA256, iterations, salt: b64encode(salt) };
}

/**
 * Derive the AES-256-GCM vault key (32 raw bytes).
 *
 * Unlike the desktop build (a non-extractable CryptoKey) the key is a plain
 * byte array held in memory — same practical exposure, since the plugin must
 * decrypt without prompting on every message.
 */
export async function deriveVaultKey(passphrase: string, params: VaultKdfParams): Promise<Uint8Array> {
    if (params.algorithm !== KDF_PBKDF2_SHA256) {
        throw new Error(`unsupported vault KDF: ${params.algorithm}`);
    }
    if (!Number.isInteger(params.iterations) || params.iterations < MIN_PBKDF2_ITERATIONS) {
        throw new Error(`refusing to derive with ${params.iterations} PBKDF2 iterations`);
    }

    return pbkdf2(sha256, utf8(passphrase), b64decode(params.salt), {
        c: params.iterations,
        dkLen: 32,
    });
}

// ------------------------------ Record encryption ------------------------------

/**
 * Wrap a JSON-serialisable value.
 *
 * A fresh random IV per record is required, not merely nice: the vault key is
 * long-lived and re-encrypts the session store on every message, so a fixed or
 * counter IV would repeat across restarts and break AES-GCM catastrophically.
 * Random 96-bit IVs are safe well past the number of writes this plugin can
 * plausibly perform (collisions become a concern around 2^32 encryptions).
 */
export async function vaultEncrypt(key: Uint8Array, value: unknown): Promise<VaultBlob> {
    const iv = randomBytes(IV_BYTES);
    const ct = gcm(key, iv).encrypt(utf8(JSON.stringify(value)));
    return { __e2eeVault: true, v: 2, iv: b64encode(iv), ct: b64encode(ct) };
}

/**
 * Unwrap a record.
 *
 * Any failure is reported as `WrongPassphraseError`, because from the caller's
 * position a wrong key and a tampered record are indistinguishable and lead to
 * the same action (ask for the passphrase again). GCM's tag is what makes this
 * safe: it fails closed rather than yielding garbage plaintext.
 */
export async function vaultDecrypt<T>(key: Uint8Array, blob: VaultBlob): Promise<T> {
    let json: string;
    try {
        const pt = gcm(key, b64decode(blob.iv)).decrypt(b64decode(blob.ct));
        json = utf8dStrict(pt);
    } catch {
        throw new WrongPassphraseError();
    }
    return JSON.parse(json) as T;
}

// ------------------------------ Passphrase verification ------------------------------

export async function makeVaultMeta(passphrase: string, iterations?: number): Promise<{ meta: VaultMeta; key: Uint8Array; }> {
    const kdf = newKdfParams(iterations);
    const key = await deriveVaultKey(passphrase, kdf);
    return { meta: { kdf, check: await vaultEncrypt(key, CHECK_PLAINTEXT) }, key };
}

/**
 * Derive and verify in one step. Returns the key, or throws
 * `WrongPassphraseError` — verified against the check blob so a bad passphrase
 * is caught before we try to decrypt (and possibly destroy) real data.
 */
export async function unlockVault(passphrase: string, meta: VaultMeta): Promise<Uint8Array> {
    const key = await deriveVaultKey(passphrase, meta.kdf);
    const check = await vaultDecrypt<string>(key, meta.check);
    if (check !== CHECK_PLAINTEXT) throw new WrongPassphraseError();
    return key;
}
