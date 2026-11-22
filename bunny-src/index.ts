/*
 * E2EE for Revenge (Bunny) — port of the Vencord E2EE plugin
 * (https://github.com/tobi437a/vencord-E2EE, GPL-3.0-or-later).
 *
 * Wires the crypto + session layer into Discord:
 *   • A lock button in the chat input bar toggles E2EE on/off per DM.
 *   • Outgoing messages are intercepted at Discord's sendMessage action and
 *     replaced with their encrypted form when a session is ready. Edits are
 *     blocked in E2EE DMs (a re-encrypt would desync the ratchet).
 *   • Incoming messages are intercepted by Flux dispatches (MESSAGE_CREATE and
 *     friends). Encrypted ones are decrypted; the plaintext is stored in a
 *     per-message cache so reloads don't show ciphertext, and the message in
 *     the Discord store is mutated in place so it renders as plaintext.
 *
 * Loader contract (Revenge Plugin Browser):
 *   (bunny, definePlugin) => { <this bundle>; return plugin?.default ?? plugin; }
 * This bundle sets the `plugin` binding through definePlugin/globalThis so the
 * loader picks the instance up, and it works under the Vendetta URL-install
 * loader too (window.bunny exists there as well).
 *
 * Crypto runs on pure-JS @noble primitives (Hermes has no WebCrypto); the wire
 * protocol v2 is identical to the desktop build, so Vencord and Revenge users
 * can talk securely to each other.
 */

import { hasNativeRng } from "./crypto";
import { runExclusive, serialWriter } from "./serial";
import {
    buildAck, buildInit, decryptForSession, deserializeIdentity, deserializeSession,
    emptySession, encryptForSession, handleAck, Identity, isE2EEMessage, isLegacyE2EEMessage,
    MessageTooLongError, newIdentity, parseInit, PREFIX_ACK, PREFIX_INIT, PREFIX_MSG, PREFIX_RESET,
    SerializedIdentity, SerializedSession, serializeIdentity, serializeSession, Session,
} from "./session";
import { DataStore, doc as storageDoc } from "./store";
import {
    ChannelStore, findChatInputActions, fluxDispatcher, h, MessageActions, MessageStore,
    patcher, React, RN, SelectedChannelStore, UserStore,
} from "./ctx";
import { askChoice, askPassphrase } from "./ui";
import { b64encode as b64encodeLocal, safetyNumber as safetyNumberLocal } from "./crypto";
import {
    isVaultBlob, isVaultMeta, makeVaultMeta, unlockVault, vaultDecrypt, vaultEncrypt,
    VaultMeta, WrongPassphraseError,
} from "./vault";

// ------------------------------ Logger ------------------------------

const log = {
    info: (...args: unknown[]) => console.log("[E2EE]", ...args),
    warn: (...args: unknown[]) => console.warn("[E2EE]", ...args),
    error: (...args: unknown[]) => console.error("[E2EE]", ...args),
};

// ------------------------------ Toasts ------------------------------

function toast(text: string, _variant: "default" | "success" | "critical" = "default") {
    try {
        // bunny.ui.toasts.showToast(content) — the bundle's toast wrapper keys
        // and normalizes for us; variants are conveyed by emoji prefixes.
        (globalThis as any).bunny.ui.toasts.showToast(text);
    } catch (e) {
        log.warn("toast failed", e);
    }
}

function showSafetyNumberOnReady(): boolean {
    return storageDoc?.showSafetyNumberOnReady ?? true;
}

// ------------------------------ Persistent storage ------------------------------

/*
 * Stores split into two classes.
 *
 * SECRET stores are wrapped by the vault when at-rest encryption is on:
 *   identity   — the long-term X25519 private key
 *   sessions   — root keys, chain keys, skipped message keys
 *   decrypted  — the plaintext of every message you've read
 *
 * PUBLIC stores are never wrapped (channel IDs, message IDs, peer *public*
 * keys — nothing the Discord account itself doesn't already reveal), and
 * `enabled` in particular has to remain readable while the vault is locked.
 */
const STORE_IDENTITY = "E2EE_identity_v2"; // SECRET
const STORE_SESSIONS = "E2EE_sessions_v2"; // SECRET Record<channelId, SerializedSession>
const STORE_DECRYPTED = "E2EE_decrypted_v2"; // SECRET Record<messageId, string>
const STORE_ENABLED = "E2EE_enabled_v2"; // public  Record<channelId, boolean>
const STORE_PROCESSED = "E2EE_processed_v2"; // public  string[] of handshake message IDs
const STORE_KNOWN_KEYS = "E2EE_knownKeys_v2"; // public  Record<userId, b64 identity pubkey>
const STORE_VAULT = "E2EE_vault_v2"; // public  VaultMeta

const LEGACY_STORE_IDENTITY = "E2EE_identity_v1";
const LEGACY_STORE_SESSIONS = "E2EE_sessions_v1";
const LEGACY_STORE_DECRYPTED = "E2EE_decrypted_v1";
const LEGACY_STORE_ENABLED = "E2EE_enabled_v1";
const LEGACY_STORE_PROCESSED = "E2EE_processed_v1";
const LEGACY_STORE_KNOWN_KEYS = "E2EE_knownKeys_v1";

let identity: Identity | null = null;
const sessions = new Map<string, Session>();
const decryptedCache = new Map<string, string>();
const enabledChannels = new Set<string>();
const knownPeerKeys = new Map<string, string>();
const processedHandshakeMsgs = new Set<string>();

const pendingOwnPlaintext = new Map<string, string>();
const MAX_PENDING_OWN = 200;

/** Drop the oldest entries of an insertion-ordered collection past `max`. */
function trimOldest(collection: Map<string, unknown> | Set<string>, max: number) {
    for (const key of collection.keys()) {
        if (collection.size <= max) break;
        collection.delete(key);
    }
}

function rememberOwnPlaintext(wire: string, plaintext: string) {
    pendingOwnPlaintext.delete(wire);
    pendingOwnPlaintext.set(wire, plaintext);
    trimOldest(pendingOwnPlaintext, MAX_PENDING_OWN);
}

function recallOwnPlaintext(wire: string): string | undefined {
    const pt = pendingOwnPlaintext.get(wire);
    if (pt === undefined) return undefined;
    pendingOwnPlaintext.delete(wire);
    pendingOwnPlaintext.set(wire, pt);
    return pt;
}

const inFlightWire = new Map<string, string>();
const MAX_IN_FLIGHT = 50;

const failedSends = new Set<string>();

const unencryptedInSecureChat = new Set<string>();
const MAX_UNENCRYPTED_FLAGS = 500;

const lockedMessages = new Map<string, { channelId: string; message: any; }>();
const MAX_LOCKED_MESSAGES = 500;

const MAX_DECRYPTED_CACHE = 5000;
let decryptedDirty = false;
let unsavedIncoming = false;
function cacheDecrypted(messageId: string, plaintext: string) {
    decryptedCache.set(messageId, plaintext);
    trimOldest(decryptedCache, MAX_DECRYPTED_CACHE);
    decryptedDirty = true;
    unsavedIncoming = true;
}

// React subscribers that want to re-render when E2EE state changes.
const stateSubscribers = new Set<() => void>();
function notifyStateChange() {
    for (const fn of stateSubscribers) {
        try { fn(); } catch (e) { log.warn("state subscriber threw", e); }
    }
}

// ------------------------------ Vault (encryption at rest) ------------------------------

let vaultKey: Uint8Array | null = null;
let vaultLocked = false;
let vaultActive = false;
let secretsLoaded = false;

async function readSecret<T>(key: string): Promise<T | undefined> {
    const raw = await DataStore.get<unknown>(key);
    if (raw === undefined) return undefined;
    if (isVaultBlob(raw)) {
        if (!vaultKey) throw new Error(`${key} is encrypted but the vault is locked`);
        return await vaultDecrypt<T>(vaultKey, raw);
    }
    return raw as T;
}

async function writeSecret(key: string, value: unknown): Promise<void> {
    if (vaultLocked || !secretsLoaded) return;
    await DataStore.set(key, vaultKey ? await vaultEncrypt(vaultKey, value) : value);
}

async function migrateLegacyStores() {
    if (await DataStore.get(STORE_IDENTITY) !== undefined) return; // already on v2

    const legacyIdentity = await DataStore.get<SerializedIdentity>(LEGACY_STORE_IDENTITY);
    if (!legacyIdentity) return; // fresh install

    log.info("Migrating v1 data to protocol v2");

    await DataStore.set(STORE_IDENTITY, legacyIdentity);

    const legacyKnown = await DataStore.get<Record<string, string>>(LEGACY_STORE_KNOWN_KEYS);
    if (legacyKnown) await DataStore.set(STORE_KNOWN_KEYS, legacyKnown);

    const legacyDecrypted = await DataStore.get<Record<string, string>>(LEGACY_STORE_DECRYPTED);
    if (legacyDecrypted) await DataStore.set(STORE_DECRYPTED, legacyDecrypted);

    const legacyEnabled = await DataStore.get<Record<string, boolean>>(LEGACY_STORE_ENABLED);
    if (legacyEnabled) await DataStore.set(STORE_ENABLED, legacyEnabled);

    for (const key of [
        LEGACY_STORE_IDENTITY, LEGACY_STORE_SESSIONS, LEGACY_STORE_DECRYPTED,
        LEGACY_STORE_ENABLED, LEGACY_STORE_PROCESSED, LEGACY_STORE_KNOWN_KEYS,
    ]) {
        await DataStore.del(key);
    }

    log.info("Migration complete — existing DMs will re-handshake under v2");
}

async function promptUnlock(meta: VaultMeta): Promise<Uint8Array | null> {
    let derived: Uint8Array | null = null;
    const answered = await askPassphrase("unlock", async passphrase => {
        try {
            derived = await unlockVault(passphrase, meta);
            return null;
        } catch (e) {
            derived = null;
            if (e instanceof WrongPassphraseError) return "That password isn't right. Try again.";
            log.error("Vault unlock failed", e);
            return `Could not unlock: ${e}`;
        }
    });
    return answered === null ? null : derived;
}

async function loadAll() {
    await migrateLegacyStores();

    const enRaw = await DataStore.get<Record<string, boolean>>(STORE_ENABLED) ?? {};
    for (const [chId, on] of Object.entries(enRaw)) if (on) enabledChannels.add(chId);

    const procRaw = await DataStore.get<string[]>(STORE_PROCESSED) ?? [];
    for (const id of procRaw) processedHandshakeMsgs.add(id);

    const keysRaw = await DataStore.get<Record<string, string>>(STORE_KNOWN_KEYS) ?? {};
    for (const [uId, k] of Object.entries(keysRaw)) knownPeerKeys.set(uId, k);

    const meta = await DataStore.get<unknown>(STORE_VAULT);
    if (isVaultMeta(meta)) {
        vaultActive = true;

        // Locked *first*, prompt second — see the desktop build for why the
        // flag must exist before any send can reach the hooks.
        vaultLocked = true;
        notifyStateChange();

        // Deliberately not awaited: blocking start on an alert would stall
        // startup, and the alert needs Discord's UI mounted to render.
        unlockAndLoad(meta).catch(e => log.error("Unlock failed", e));
        return;
    }

    await loadSecrets();
    await ensureIdentity();
}

async function unlockAndLoad(meta: VaultMeta): Promise<boolean> {
    const key = await promptUnlock(meta);
    if (!key) {
        log.warn("E2EE data left locked — no identity or sessions loaded");
        return false;
    }

    vaultKey = key;
    try {
        await loadSecrets();
    } catch (e) {
        vaultKey = null;
        log.error("Could not read the saved E2EE data", e);
        toast("🔐 Your password was right, but the saved data could not be read. See the console for details.", "critical");
        return false;
    }
    vaultLocked = false;
    await ensureIdentity();

    replayLockedMessages();
    notifyStateChange();
    return true;
}

async function loadSecrets() {
    const idRaw = await readSecret<SerializedIdentity>(STORE_IDENTITY);
    const sessRaw = await readSecret<Record<string, SerializedSession>>(STORE_SESSIONS) ?? {};
    const decRaw = await readSecret<Record<string, string>>(STORE_DECRYPTED) ?? {};

    if (idRaw) identity = await deserializeIdentity(idRaw);

    for (const [chId, s] of Object.entries(sessRaw)) {
        try { sessions.set(chId, await deserializeSession(s)); }
        catch (e) { log.warn("Bad stored session for", chId, e); }
    }

    for (const [mId, pt] of Object.entries(decRaw)) decryptedCache.set(mId, pt);

    secretsLoaded = true;
}

async function ensureIdentity() {
    if (identity) return;
    identity = await newIdentity();
    await persistIdentity();
    log.info("Generated new identity keypair");
}

async function persistIdentity() {
    if (!identity) return;
    await writeSecret(STORE_IDENTITY, await serializeIdentity(identity));
}

const persistState = serialWriter(async () => {
    const plaintext = decryptedDirty ? Object.fromEntries(decryptedCache) : null;
    decryptedDirty = false;
    const pending = Array.from(sessions, async ([id, s]) => [id, await serializeSession(s)] as const);

    try {
        if (plaintext) await writeSecret(STORE_DECRYPTED, plaintext);
    } catch (e) {
        decryptedDirty = true;
        throw e;
    }
    await writeSecret(STORE_SESSIONS, Object.fromEntries(await Promise.all(pending)));
});

async function persistEnabled() {
    const out: Record<string, boolean> = {};
    for (const id of enabledChannels) out[id] = true;
    await DataStore.set(STORE_ENABLED, out);
}

// ------------------------------ Vault setup / teardown ------------------------------

async function unlockNow(): Promise<boolean> {
    const meta = await DataStore.get<unknown>(STORE_VAULT);
    if (!isVaultMeta(meta)) {
        vaultLocked = false;
        notifyStateChange();
        return true;
    }

    if (!await unlockAndLoad(meta)) return false;
    toast("🔐 Unlocked — your encrypted messages are readable again.", "success");
    return true;
}

async function enableVault() {
    if (await DataStore.get(STORE_VAULT) !== undefined) return; // already on

    if (vaultLocked) {
        toast("🔐 Unlock your saved messages first.", "critical");
        return;
    }

    if (!secretsLoaded) {
        toast("🔐 Turn the E2EE plugin on first, then set a password.", "critical");
        return;
    }

    const passphrase = await askPassphrase("create", async () => null);
    if (passphrase === null) {
        toast("🔐 Password setup cancelled — nothing was changed.");
        return;
    }

    const { meta, key } = await makeVaultMeta(passphrase);
    vaultKey = key;

    // Metadata first: metadata present with still-plaintext stores is
    // self-healing on next start; the reverse order would leave encrypted
    // blobs with no key to derive.
    await DataStore.set(STORE_VAULT, meta);
    await persistIdentity();
    decryptedDirty = true;
    await persistState();
    vaultActive = true;

    toast("🔐 Your saved messages are now password-protected. You'll be asked for the password when Discord starts.", "success");
}

async function disableVault() {
    if (await DataStore.get(STORE_VAULT) === undefined) return; // already off

    if (vaultLocked || !vaultKey) {
        if (!await unlockNow()) {
            toast("🔐 Enter your password first to turn this off.", "critical");
            return;
        }
    }

    vaultKey = null;
    await persistIdentity();
    decryptedDirty = true;
    await persistState();
    await DataStore.del(STORE_VAULT);
    vaultActive = false;

    toast("🔐 Password protection turned off. Your saved messages are no longer protected on this device.");
}

async function persistProcessed() {
    await DataStore.set(STORE_PROCESSED, Array.from(processedHandshakeMsgs));
}

async function markProcessed(messageId: string) {
    if (!messageId) return;
    if (processedHandshakeMsgs.has(messageId)) return;
    processedHandshakeMsgs.add(messageId);
    await persistProcessed();
}

// ------------------------------ Peer identity key pinning ------------------------------

function checkPeerKey(userId: string, idPub: Uint8Array): "new" | "match" | "changed" {
    const known = knownPeerKeys.get(userId);
    if (!known) return "new";
    return known === b64encodeLocal(idPub) ? "match" : "changed";
}

async function pinPeerKey(userId: string, idPub: Uint8Array) {
    const b64 = b64encodeLocal(idPub);
    if (knownPeerKeys.get(userId) === b64) return;
    knownPeerKeys.set(userId, b64);
    await DataStore.set(STORE_KNOWN_KEYS, Object.fromEntries(knownPeerKeys));
}

function getPeerUserId(channelId: string): string | null {
    const ch = ChannelStore?.getChannel?.(channelId);
    return ch?.recipients?.[0] ?? null;
}

// ------------------------------ Handshake actions ------------------------------

async function startHandshake(channelId: string) {
    if (!identity) return;
    const { wire, eph } = await buildInit(identity);
    sessions.set(channelId, { ...emptySession(), phase: "init-sent", pendingEph: eph });
    await persistState();
    notifyStateChange();
    sendRaw(channelId, wire);
}

function hasChangedKey(channelId: string, s: Session): boolean {
    const peerId = getPeerUserId(channelId);
    return !!peerId && !!s.peerIdPub && checkPeerKey(peerId, s.peerIdPub) === "changed";
}

async function sendPrime(channelId: string, s: Session) {
    const text = "🔐 Secure channel established.";
    const wire = await encryptForSession(s, text);
    rememberOwnPlaintext(wire, text);
    await persistState();
    sendRaw(channelId, wire);
}

async function turnOff(channelId: string) {
    const previous = sessions.get(channelId);
    enabledChannels.delete(channelId);
    sessions.delete(channelId);
    await persistEnabled();
    await persistState();
    notifyStateChange();
    if (previous && previous.phase !== "none" && previous.phase !== "peer-reset") sendRaw(channelId, PREFIX_RESET);
}

async function acceptInvite(channelId: string, s: Session): Promise<Session | null> {
    if (!identity) return null;
    if (!s.peerIdPub || !s.peerEphPub) {
        log.error("init-recvd phase missing peer keys", channelId);
        sessions.delete(channelId);
        await persistState();
        notifyStateChange();
        toast("🔐 Handshake failed — invitation was corrupt.", "critical");
        return null;
    }
    try {
        const { wire, session: newSession } = await buildAck(identity, s.peerIdPub, s.peerEphPub);
        sessions.set(channelId, newSession);
        await persistState();
        const peerId = getPeerUserId(channelId);
        if (peerId) await pinPeerKey(peerId, s.peerIdPub);
        notifyStateChange();
        sendRaw(channelId, wire);
        return newSession;
    } catch (e) {
        log.error("Failed to build ACK", e);
        toast("🔐 Handshake failed.", "critical");
        return null;
    }
}

// ------------------------------ Outgoing message hook ------------------------------

/**
 * Called in place of Discord's sendMessage action (spitroast patch).
 * Past the "enabled DM" check the message must either be encrypted or
 * dropped: an error escaping from here must not send the plaintext.
 */
async function onSend(channelId: string, data: any): Promise<{ cancel: boolean } | void> {
    if (!enabledChannels.has(channelId)) return;

    const ch = ChannelStore?.getChannel?.(channelId);
    if (!ch || !isDM(ch)) return; // Only DMs are supported.

    const hasAttachments = Array.isArray(data?.attachments) && data.attachments.length > 0;

    try {
        const result = await sendEncrypted(channelId, data);
        if (!result?.cancel && hasAttachments) {
            toast("⚠️ Your text was encrypted, but the attached file was NOT. Discord can see it.", "critical");
        }
        return result;
    } catch (e) {
        log.error("Send hook failed", e);
        toast("🔐 Something went wrong, so your message was not sent. It is still in the box.", "critical");
        return { cancel: true };
    }
}

async function sendEncrypted(channelId: string, msg: { content: string; }): Promise<{ cancel: boolean; } | void> {
    if (!enabledChannels.has(channelId)) {
        toast("🔐 Encryption was just turned off here. Send again to send without it.");
        return { cancel: true };
    }

    if (vaultLocked) {
        toast("🔐 Locked. Tap the 🔑 button and enter your password before sending here.", "critical");
        return { cancel: true };
    }

    if (!identity) {
        toast("🔐 E2EE isn't ready yet — try again in a moment.", "critical");
        return { cancel: true };
    }

    const s = sessions.get(channelId) ?? emptySession();

    if (s.phase === "peer-reset") {
        toast("🔐 Your friend ended the encrypted chat, so nothing was sent. Tap the ⚠️ button to choose what happens next.", "critical");
        return { cancel: true };
    }

    if (s.phase === "none") {
        await startHandshake(channelId);
        toast("🔐 Invitation sent. Your message is still in the box — send again once the button shows 🔒.");
        return { cancel: true };
    }

    if (s.phase === "init-sent") {
        toast("🔐 Still waiting for your friend to accept. Send again once the button shows 🔒.");
        return { cancel: true };
    }

    if (s.phase === "init-recvd") {
        if (hasChangedKey(channelId, s)) {
            toast("⚠️ Nothing was sent: your friend's identity key has changed. Tap the ⚠️ button to review it.", "critical");
            return { cancel: true };
        }

        const sess = await acceptInvite(channelId, s);
        if (sess) {
            const safety = showSafetyNumberOnReady() ? ` Safety #: ${sess.safetyNum}.` : "";
            toast(`🔐 Invitation accepted.${safety} Your message is still in the box — send again in a moment.`, "success");
        }
        return { cancel: true };
    }

    if (s.untrustedKey) {
        toast("⚠️ Nothing was sent: your friend's identity key has changed. Tap the ⚠️ button to review it.", "critical");
        return { cancel: true };
    }

    try {
        const plaintext = msg.content;
        const wire = await encryptForSession(s, plaintext);
        await persistState();
        msg.content = wire;
        rememberOwnPlaintext(wire, plaintext);
    } catch (e) {
        if (e instanceof MessageTooLongError) {
            toast(`🔐 Too long to send encrypted: ${e.wireLength}/${e.maxLength} characters once encrypted. Remove about ${e.approxCharsToRemove} characters, or split it into two messages.`, "critical");
            return { cancel: true };
        }

        log.error("Encrypt failed", e);
        toast(
            String(e).includes("no sending chain")
                ? "🔐 Waiting for the peer's first encrypted message — try again in a moment."
                : "🔐 Encryption failed; aborting send.",
            "critical"
        );
        return { cancel: true };
    }
}

/**
 * Edits go through Discord's edit action — without this hook, editing one of
 * your own encrypted messages would ship the new content in PLAINTEXT.
 * Re-encrypting an edit isn't useful either (the ratchet can't re-key an old
 * message; the peer would decrypt it out of order), so edits are blocked.
 */
function onEdit(channelId: string, args: any[]): any {
    const ch = ChannelStore?.getChannel?.(channelId);
    if (!ch || !isDM(ch)) return undefined; // pass through

    const messageId = String(args[1] ?? "");
    const original = messageId ? MessageStore?.getMessage?.(channelId, messageId) : undefined;
    const wasE2EE = (messageId && decryptedCache.has(messageId))
        || isE2EEMessage(original?.content ?? "");

    if (!wasE2EE) return undefined; // pass through

    toast("🔐 Editing encrypted messages is disabled — the ratchet can't re-key an old message.", "critical");
    return false; // falsy from instead() drops the call
}

// ------------------------------ Incoming message hook ------------------------------

async function handleIncoming(channelId: string, message: any, optimistic = false): Promise<void> {
    if (!message?.content) return;
    const content: string = message.content;
    if (!isE2EEMessage(content)) return;

    const ch = ChannelStore?.getChannel?.(channelId);
    if (!ch || !isDM(ch)) return;

    if (optimistic && failedSends.has(message.id)) return;

    if (isLegacyE2EEMessage(content)) {
        replaceContent(channelId, message, "🔐 [E2EE v1 message — this build speaks v2 only. If the peer is on v1, both of you need to update and re-handshake.]");
        return;
    }

    if (vaultLocked) {
        if (!optimistic && message.id) {
            lockedMessages.set(message.id, { channelId, message: { ...message } });
            trimOldest(lockedMessages, MAX_LOCKED_MESSAGES);
        }
        replaceContent(channelId, message, "🔐 [Locked — enter your password to read this message]");
        return;
    }

    if (!identity) return;

    const me = UserStore?.getCurrentUser?.();
    if (!me?.id || !message.author?.id) return;
    const fromSelf = message.author.id === me.id;

    if (optimistic && fromSelf && message.id) {
        inFlightWire.delete(message.id);
        inFlightWire.set(message.id, content);
        trimOldest(inFlightWire, MAX_IN_FLIGHT);
    }

    const markProcessedIfReal = (id: string) =>
        optimistic ? Promise.resolve() : markProcessed(id);

    const isHandshake =
        content.startsWith(PREFIX_INIT) ||
        content.startsWith(PREFIX_ACK) ||
        content.startsWith(PREFIX_RESET);
    const alreadyProcessed = isHandshake && processedHandshakeMsgs.has(message.id);

    try {
        if (content.startsWith(PREFIX_INIT)) {
            if (fromSelf) {
                replaceContent(channelId, message, "🔐 [E2EE handshake invitation sent]");
                await markProcessedIfReal(message.id);
                return;
            }
            if (alreadyProcessed) {
                const current = sessions.get(channelId);
                let stillPending = false;
                let keyChanged = false;
                if (current?.phase === "init-recvd" && current.peerEphPub) {
                    try {
                        const parsed = parseInit(content);
                        stillPending = b64encodeLocal(parsed.peerEphPub) === b64encodeLocal(current.peerEphPub);
                        keyChanged = stillPending
                            && checkPeerKey(message.author.id, parsed.peerIdPub) === "changed";
                    } catch { }
                }
                replaceContent(
                    channelId, message,
                    stillPending
                        ? inviteLabel(keyChanged, current?.safetyNum ?? null)
                        : "🔐 [E2EE handshake invitation — historic]"
                );
                return;
            }

            const { peerIdPub, peerEphPub } = parseInit(content);
            const current = sessions.get(channelId);

            if (current && current.phase !== "none" && current.phase !== "peer-reset") {
                const reason =
                    current.phase === "ready" ? "secure channel already active" :
                    current.phase === "init-sent" ? "outgoing handshake in flight" :
                    /* init-recvd */ "another invitation already pending";
                replaceContent(channelId, message, `🔐 [E2EE handshake invitation ignored — ${reason}]`);
                toast(`🔐 Peer sent a handshake invitation, but ${reason}. Toggle the lock off and on to reset if you want to accept it.`);
                await markProcessedIfReal(message.id);
                return;
            }

            const keyChanged = checkPeerKey(message.author.id, peerIdPub) === "changed";

            const pending: Session = {
                ...emptySession(),
                phase: "init-recvd",
                peerIdPub,
                peerEphPub,
                safetyNum: await safetyNumberLocal(identity.publicKey, peerIdPub),
            };
            sessions.set(channelId, pending);
            await persistState();
            notifyStateChange();
            replaceContent(channelId, message, inviteLabel(keyChanged, pending.safetyNum));
            if (keyChanged) {
                toast("⚠️ E2EE: your friend wants to start a secure channel, but their identity key has CHANGED since you last talked. This could be a new install — or an attacker. Tap the ⚠️ button to see the safety number and compare it with them first.", "critical");
            } else {
                toast("🔐 Peer wants to start a secure channel. Tap the lock to accept (or ignore to decline).");
            }
            await markProcessedIfReal(message.id);
            return;
        }

        if (content.startsWith(PREFIX_ACK)) {
            if (fromSelf) {
                replaceContent(channelId, message, "🔐 [E2EE handshake response sent]");
                await markProcessedIfReal(message.id);
                return;
            }
            if (alreadyProcessed) {
                replaceContent(channelId, message, "🔐 [E2EE handshake response — historic]");
                return;
            }
            const s = sessions.get(channelId);
            if (!s || s.phase !== "init-sent" || !s.pendingEph) {
                log.warn("Got ACK with no pending init for channel", channelId);
                replaceContent(channelId, message, "🔐 [unexpected E2EE ACK]");
                await markProcessedIfReal(message.id);
                return;
            }
            const newSession = await handleAck(identity, s.pendingEph, content);

            newSession.untrustedKey = !!newSession.peerIdPub
                && checkPeerKey(message.author.id, newSession.peerIdPub) === "changed";
            sessions.set(channelId, newSession);
            await persistState();
            notifyStateChange();

            if (newSession.untrustedKey) {
                replaceContent(
                    channelId, message,
                    "⚠️ [E2EE invitation answered with a DIFFERENT identity key than last time. " +
                    `Nothing will be sent until you tap the ⚠️ button and confirm. Safety number: ${newSession.safetyNum}]`
                );
                toast("⚠️ E2EE: your friend's identity key has CHANGED since you last talked. Nothing will be sent until you tap the ⚠️ button and confirm it.", "critical");
                await markProcessedIfReal(message.id);
                return;
            }

            if (newSession.peerIdPub) await pinPeerKey(message.author.id, newSession.peerIdPub);
            await sendPrime(channelId, newSession).catch(e => log.error("Failed to send priming message", e));

            replaceContent(channelId, message, "🔐 E2EE secure channel established.");
            if (showSafetyNumberOnReady()) {
                toast(`🔐 Secure channel established. Safety #: ${newSession.safetyNum}`, "success");
            }
            await markProcessedIfReal(message.id);
            return;
        }

        if (content.startsWith(PREFIX_RESET)) {
            if (fromSelf) {
                replaceContent(channelId, message, "🔐 [E2EE reset sent]");
                await markProcessedIfReal(message.id);
                return;
            }
            if (alreadyProcessed) {
                replaceContent(channelId, message, "🔐 [E2EE reset — historic]");
                return;
            }
            if (enabledChannels.has(channelId)) {
                sessions.set(channelId, { ...emptySession(), phase: "peer-reset" });
                replaceContent(channelId, message, "⚠️ Your friend ended the encrypted chat. Nothing can be sent here until you tap the ⚠️ button and choose what to do.");
                toast("⚠️ E2EE: your friend ended the encrypted chat. Tap the ⚠️ button to choose what happens next.", "critical");
            } else {
                sessions.delete(channelId);
                replaceContent(channelId, message, "🔐 [E2EE invitation withdrawn]");
            }
            await persistState();
            notifyStateChange();
            await markProcessedIfReal(message.id);
            return;
        }

        if (content.startsWith(PREFIX_MSG)) {
            if (decryptedCache.has(message.id)) {
                replaceContent(channelId, message, decryptedCache.get(message.id)!);
                return;
            }

            if (fromSelf) {
                const pt = recallOwnPlaintext(content);
                if (pt !== undefined) {
                    if (!optimistic) cacheDecrypted(message.id, pt);
                    replaceContent(channelId, message, pt);
                } else {
                    replaceContent(channelId, message, "🔐 [encrypted — sent]");
                }
                return;
            }

            const s = sessions.get(channelId);
            if (!s || s.phase !== "ready") {
                replaceContent(channelId, message, "🔐 [no session — cannot decrypt]");
                return;
            }
            const plaintext = await decryptForSession(s, content);
            cacheDecrypted(message.id, plaintext);
            replaceContent(channelId, message, plaintext);
        }
    } catch (e) {
        log.error("Failed to handle incoming E2EE message", e);
        if (isHandshake) await markProcessedIfReal(message.id).catch(() => { });
        replaceContent(
            channelId, message,
            isHandshake ? "🔐 [invalid E2EE handshake message]" : "🔐 [decryption failed]"
        );
    }
}

/** Make the renderer show our text instead of the raw cipher.
 *
 *  Three layers: mutate the Flux payload (consumers that haven't copied it
 *  yet), mutate the MessageStore record (records are plain mutable objects),
 *  then dispatch a synthetic MESSAGE_UPDATE so Discord rebuilds the row. */
function replaceContent(channelId: string, message: any, newContent: string) {
    if (!message) return;
    message.content = newContent;
    if ("contentParsed" in message) delete message.contentParsed;
    if (Array.isArray(message.embeds) && message.embeds.length) message.embeds = [];
    if (!message.id) return;

    const record = MessageStore?.getMessage?.(channelId, message.id);
    if (record && record.content !== newContent) {
        try { record.content = newContent; } catch (e) { /* frozen record — dispatch below still covers cached payloads */ }
    }
    try {
        fluxDispatcher?.dispatch?.({ type: "MESSAGE_UPDATE", message: { id: message.id, channel_id: channelId } });
    } catch (e) {
        log.warn("rerender dispatch failed", e);
    }
}

/** Send a raw text message bypassing our send hook (E2EE-prefixed content is
 *  short-circuited by the hook anyway). */
function sendRaw(channelId: string, content: string) {
    try {
        Promise.resolve(
            MessageActions.sendMessage(channelId, { content }, undefined, { location: "com.tobi437a.e2ee" })
        ).then((res: any) => {
            if (res?.ok === false) {
                log.error("sendRaw: send failed", res);
                toast("🔐 Failed to send E2EE message — check your connection.", "critical");
            }
        }).catch((e: any) => {
            log.error("sendRaw: send rejected", e);
            toast("🔐 Failed to send E2EE message — see console for details.", "critical");
        });
    } catch (e) {
        log.error("sendRaw: threw", e);
        toast("🔐 Failed to send E2EE message — see console for details.", "critical");
    }
}

function isDM(ch: any): boolean {
    // Discord channel types: 1 = DM, 3 = group DM. We support 1 only.
    return ch?.type === 1;
}

function inviteLabel(keyChanged: boolean, safetyNum: string | null): string {
    return keyChanged
        ? "⚠️ [E2EE invitation — your friend's identity key has CHANGED since you last talked. " +
          `Compare this safety number with them before accepting: ${safetyNum ?? "tap the ⚠️ button"}]`
        : "🔐 [E2EE handshake invitation — tap the lock to accept]";
}

function bySnowflake(a: { id: string; }, b: { id: string; }): number {
    return a.id.length - b.id.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function enqueueIncoming(channelId: string, messages: any[], optimistic = false) {
    const ours = messages.filter(m => typeof m?.content === "string" && isE2EEMessage(m.content));
    if (ours.length === 0) return;

    runExclusive(channelId, async () => {
        for (const message of ours) {
            await handleIncoming(channelId, message, optimistic)
                .catch(err => log.error("Failed to handle incoming message", err));
        }
        if (unsavedIncoming) {
            unsavedIncoming = false;
            await persistState().catch(err => {
                unsavedIncoming = true;
                throw err;
            });
        }
    }).catch(err => log.error("Failed to save E2EE state", err));
}

function replayLockedMessages() {
    const byChannel = new Map<string, any[]>();
    for (const { channelId, message } of lockedMessages.values()) {
        if (!byChannel.has(channelId)) byChannel.set(channelId, []);
        byChannel.get(channelId)!.push(message);
    }
    lockedMessages.clear();

    for (const [channelId, messages] of byChannel) {
        enqueueIncoming(channelId, messages.sort(bySnowflake));
    }
}

// ------------------------------ Flux interception ------------------------------

/*
 * ONE intercept callback for every event we care about. bunny's intercept:
 * nullish return = pass through, falsy = BLOCK, object = modify. We only
 * observe (mutating payloads in place), so we always return undefined.
 */
function fluxInterceptor(payload: any): undefined {
    switch (payload?.type) {
        case "MESSAGE_CREATE": {
            const isChat = payload.message?.type === 0 || payload.message?.type === 19;
            if (isChat && payload.channelId && enabledChannels.has(payload.channelId)
                && !isE2EEMessage(payload.message?.content ?? "")) {
                if (!unencryptedInSecureChat.has(payload.message.id)) {
                    unencryptedInSecureChat.add(payload.message.id);
                    trimOldest(unencryptedInSecureChat, MAX_UNENCRYPTED_FLAGS);
                    toast("⚠️ A message in an encrypted DM arrived WITHOUT encryption.", "critical");
                }
            }
            // Fast path: a plaintext we already know (cached decrypt or our own
            // stashed send) is swapped in synchronously, before the store
            // converts the payload into its record.
            if (payload.message?.id) {
                const cached = decryptedCache.get(payload.message.id)
                    ?? recallOwnPlaintext(payload.message?.content ?? "");
                if (typeof cached === "string" && isE2EEMessage(payload.message.content)) {
                    payload.message.content = cached;
                }
            }
            if (payload.channelId && payload.message) {
                enqueueIncoming(payload.channelId, [payload.message], payload.optimistic === true);
            }
            break;
        }
        case "MESSAGE_SUCCESS": {
            if (payload.messageId) inFlightWire.delete(payload.messageId);
            if (payload.message?.id) inFlightWire.delete(payload.message.id);
            if (payload.message) enqueueIncoming(payload.channelId ?? payload.message.channel_id, [payload.message]);
            break;
        }
        case "MESSAGE_SEND_FAILED": {
            if (!payload.messageId) break;
            failedSends.add(payload.messageId);
            trimOldest(failedSends, MAX_IN_FLIGHT);

            const wire = inFlightWire.get(payload.messageId);
            if (wire) {
                inFlightWire.delete(payload.messageId);
                const record = MessageStore?.getMessage?.(payload.channelId, payload.messageId);
                if (record) {
                    try { record.content = wire; } catch { }
                }
                try {
                    fluxDispatcher?.dispatch?.({ type: "MESSAGE_UPDATE", message: { id: payload.messageId, channel_id: payload.channelId } });
                } catch { }
            }
            break;
        }
        case "LOAD_MESSAGES_SUCCESS": {
            const messages = (payload?.messages ?? []).filter((m: any) => m?.id);
            for (const m of messages) {
                const cached = decryptedCache.get(m.id);
                if (typeof cached === "string" && isE2EEMessage(m.content ?? "")) m.content = cached;
            }
            if (payload?.channelId) enqueueIncoming(payload.channelId, messages.sort(bySnowflake));
            break;
        }
        case "MESSAGE_UPDATE": {
            if (payload.message?.channel_id) enqueueIncoming(payload.message.channel_id, [payload.message]);
            break;
        }
    }
    return undefined;
}

// ------------------------------ Lock toggle button ------------------------------

/*
 * The lock button is spliced into the chat input's action render tree — same
 * technique the community plugins use: patch ChatInputActions' render and
 * insert our element into the first children array found in the fiber.
 */

const lockButtonElement = h(LockButton, { key: "e2ee-lock" });

function insertLockButton(tree: any): any {
    const node = (globalThis as any).bunny.utils.findInReactTree(
        tree,
        (node: any): boolean => Array.isArray(node?.props?.children),
    );
    if (!node) return tree;

    const children: any[] = node.props.children;
    const index = children.indexOf(lockButtonElement);
    if (index !== -1) children.splice(index, 1);
    children.push(lockButtonElement);

    return tree;
}

let chatInputUnpatch: (() => void) | null = null;
let chatInputRetry: ReturnType<typeof setInterval> | null = null;

function setupLockButton() {
    // Poll until the module is loaded AND the patch target is confirmed to be
    // a real function. NEVER let spitroast touch a missing/non-function key:
    // a throw inside the module require chain crashes Discord's renderer.
    chatInputRetry = setInterval(() => {
        let memo: any;
        try {
            memo = (globalThis as any).bunny.metro.findByFilePath(
                "modules/chat_input/native/action_buttons/ChatInputActions.tsx", true);
        } catch { return; }
        const render = memo?.type?.render;
        if (typeof render !== "function") return;
        if (chatInputRetry) { clearInterval(chatInputRetry); chatInputRetry = null; }

        try {
            chatInputUnpatch = patcher.after("render", memo.type, (_args: any[], ret: any) => insertLockButton(ret)) as unknown as () => void;
            log.info("Lock button installed");
        } catch (e) {
            log.error("Lock button patch failed", e);
        }
    }, 1000);
}

function LockButton() {
    const [, setTick] = React.useState(0);
    React.useEffect(() => {
        const fn = () => setTick((t: number) => t + 1);
        stateSubscribers.add(fn);
        return () => { stateSubscribers.delete(fn); };
    }, []);

    const channelId: string | null = SelectedChannelStore?.getChannelId?.() ?? null;
    const channel = channelId ? ChannelStore?.getChannel?.(channelId) : undefined;
    if (!channelId || !channel || !isDM(channel)) return null;

    const sess = sessions.get(channelId);
    const enabled = enabledChannels.has(channelId);
    const safety = sess?.safetyNum ? ` — safety #: ${sess.safetyNum}` : "";

    let icon = "🔓";
    let label = "E2EE off — tap to enable";
    if (vaultLocked) {
        icon = "🔑";
        label = "Locked — tap and enter your password";
    } else if (enabled && sess?.phase === "peer-reset") {
        icon = "⚠️";
        label = "Your friend ended the encrypted chat — tap to choose what happens next";
    } else if (sess && (sess.untrustedKey || (sess.phase === "init-recvd" && hasChangedKey(channelId, sess)))) {
        icon = "⚠️";
        label = "Your friend's identity key has changed — tap to review it";
    } else if (enabled && sess?.phase === "ready") {
        icon = "🔒";
        label = `E2EE active${safety}`;
    } else if (enabled && sess?.phase === "init-sent") {
        icon = "🟡";
        label = "E2EE handshake in progress";
    } else if (sess?.phase === "init-recvd") {
        icon = "📩";
        label = (enabled
            ? "Peer requested E2EE — send a message to accept"
            : "Peer requested E2EE — tap the lock to accept") + safety;
    } else if (enabled) {
        icon = "🟡";
        label = "E2EE enabled — send a message to start handshake";
    }

    return h(RN.Text, { style: { fontSize: 20, padding: 4 } }, icon);
}

// ------------------------------ Lock actions ------------------------------

function lockAction(channelId: string, action: () => Promise<void>) {
    runExclusive(channelId, action).catch(e => {
        log.error("Lock action failed", e);
        toast("🔐 That didn't work — see the console for details.", "critical");
    });
}

async function onLockTapped(channelId: string) {
    if (vaultLocked) {
        await unlockNow();
        return;
    }

    const s = sessions.get(channelId);
    const enabled = enabledChannels.has(channelId);

    if (enabled && s?.phase === "peer-reset") {
        const choice = await askChoice({
            title: "Your friend ended the encrypted chat",
            subtitle: "Nothing can be sent in this DM until you choose what happens next.",
            warning:
                "This notice can be faked by someone tampering with the chat. If you weren't expecting it, " +
                "check with your friend some other way before carrying on without encryption.",
            choices: [
                { id: "plain", text: "Continue without encryption", variant: "secondary" },
                { id: "encrypt", text: "Turn encryption back on", variant: "primary" },
            ],
        });
        if (choice === "encrypt") lockAction(channelId, async () => {
            if (sessions.get(channelId)?.phase !== "peer-reset") return;
            await startHandshake(channelId);
            toast("🔐 Invitation sent — the button shows 🔒 once your friend accepts.");
        });
        if (choice === "plain") lockAction(channelId, async () => {
            await turnOff(channelId);
            toast("🔐 E2EE disabled for this DM. Messages here are no longer encrypted.");
        });
        return;
    }

    if (s && (s.untrustedKey || (s.phase === "init-recvd" && hasChangedKey(channelId, s)))) {
        const choice = await askChoice({
            title: "Your friend's identity key has changed",
            subtitle:
                "This happens when they reinstall the plugin or clear its data. " +
                "It is also exactly what someone impersonating them would look like.",
            warning:
                "Compare the safety number below with your friend over a voice call or in person. " +
                "Only continue if you both see the same digits.",
            body: h(RN.Text, { style: { fontFamily: "monospace", fontSize: 18, letterSpacing: 2 } }, s.safetyNum),
            choices: [
                { id: "off", text: s.phase === "ready" ? "Turn encryption off" : "Decline", variant: "secondary" },
                { id: "trust", text: "They match — trust this key", variant: "critical-primary" },
            ],
        });
        if (choice === "trust") lockAction(channelId, () => trustChangedKey(channelId));
        if (choice === "off") lockAction(channelId, async () => {
            await turnOff(channelId);
            toast("🔐 The new key was not trusted. E2EE is off for this DM.");
        });
        return;
    }

    if (enabled && s?.phase === "ready") {
        const choice = await askChoice({
            title: "Turn off encryption?",
            subtitle:
                "New messages in this DM will be readable by Discord again. Your friend is told, and their side " +
                "stays closed until they confirm. Messages you have already saved stay readable.",
            choices: [
                { id: "keep", text: "Keep encrypted", variant: "secondary" },
                { id: "off", text: "Turn off", variant: "critical-primary" },
            ],
        });
        if (choice === "off") lockAction(channelId, async () => {
            await turnOff(channelId);
            toast("🔐 E2EE disabled for this DM.");
        });
        return;
    }

    lockAction(channelId, () => toggleLock(channelId));
}

async function toggleLock(channelId: string) {
    const pending = sessions.get(channelId);

    if (enabledChannels.has(channelId)) {
        if (pending?.phase === "ready" || pending?.phase === "peer-reset") return;

        await turnOff(channelId);
        toast(
            pending?.phase === "init-recvd"
                ? "🔐 Handshake invitation declined."
                : "🔐 E2EE disabled for this DM."
        );
        return;
    }

    if (!identity) return;
    if (pending?.phase === "init-recvd" && hasChangedKey(channelId, pending)) return;

    enabledChannels.add(channelId);
    await persistEnabled();
    notifyStateChange();
    if (pending?.phase === "init-recvd") {
        const sess = await acceptInvite(channelId, pending);
        if (sess) {
            const safety = showSafetyNumberOnReady() ? ` Safety #: ${sess.safetyNum}.` : "";
            toast(`🔐 E2EE handshake accepted.${safety}`, "success");
        }
    } else if (!pending || pending.phase === "none") {
        await startHandshake(channelId);
        toast("🔐 Invitation sent — the button shows 🔒 once your friend accepts.");
    }
}

async function trustChangedKey(channelId: string) {
    const s = sessions.get(channelId);
    const peerId = getPeerUserId(channelId);
    if (!s?.peerIdPub || !peerId) return;

    if (s.phase === "init-recvd") {
        enabledChannels.add(channelId);
        await persistEnabled();
        notifyStateChange();
        if (await acceptInvite(channelId, s)) toast("🔐 Invitation accepted with the new key.", "success");
        return;
    }

    if (s.phase === "ready" && s.untrustedKey) {
        s.untrustedKey = false;
        await pinPeerKey(peerId, s.peerIdPub);
        await sendPrime(channelId, s);
        notifyStateChange();
        toast("🔐 New key trusted. Secure channel established.", "success");
    }
}

// ------------------------------ Settings ------------------------------

function SettingsComponent() {
    const [, setTick] = React.useState(0);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        const fn = () => setTick((t: number) => t + 1);
        stateSubscribers.add(fn);
        return () => { stateSubscribers.delete(fn); };
    }, []);

    const { TableRowGroup, TableSwitchRow, Stack } = (globalThis as any).bunny.metro.common.components;

    return h(Stack, { spacing: 24 },
        h(TableRowGroup, { title: "Safety" },
            h(TableSwitchRow, {
                label: "Show safety number when a secure channel is ready",
                subLabel: "Compare it with your friend out-of-band to detect man-in-the-middle attacks.",
                value: showSafetyNumberOnReady(),
                onValueChange: (v: boolean) => {
                    storageDoc.showSafetyNumberOnReady = v;
                    setTick((t: number) => t + 1);
                },
            }),
        ),
        h(TableRowGroup, { title: "Data at rest" },
            h(TableSwitchRow, {
                label: "Password-protect saved messages",
                subLabel:
                    "Locks the messages this plugin has saved on this device behind a password. " +
                    "You'll enter it each time Discord starts. If you forget it, every message " +
                    "you've sent or received with this plugin is lost for good — there is no reset.",
                value: vaultActive,
                disabled: busy,
                onValueChange: (want: boolean) => {
                    setBusy(true);
                    (async () => {
                        try {
                            if (want) await enableVault();
                            else await disableVault();
                        } catch (e) {
                            log.error("Vault reconfiguration failed", e);
                            toast(`🔐 Could not change the password setting: ${e}`, "critical");
                        } finally {
                            setBusy(false);
                            notifyStateChange();
                        }
                    })();
                },
            }),
        ),
    );
}

// ------------------------------ Plugin instance ------------------------------

let fluxUnsub: (() => void) | null = null;
let sendUnpatch: (() => void) | null = null;
let editUnpatch: (() => void) | null = null;

function start() {
    (globalThis as any).__e2eeStarted = true;
    if (!hasNativeRng()) {
        log.warn(
            "No CSPRNG available in this runtime (crypto.getRandomValues missing). " +
            "Key generation falls back to a SHA-256 entropy pool — E2EE security is REDUCED. " +
            "Consider generating your identity on a desktop build and transferring it.",
        );
    }

    loadAll()
        .then(() => log.info("E2EE state loaded"))
        .catch(e => log.error("E2EE: initial load failed", e));

    // Outgoing: intercept Discord's message actions (spitroast callbacks get
    // (thisArg, args, orig) — we defer to runExclusive, then either replay the
    // original call with mutated args or drop it).
    try {
        // spitroast callbacks: instead(args, orig) -> return value; orig is
        // pre-bound, called as orig(...args).
        sendUnpatch = patcher.instead("sendMessage", MessageActions, (args: any[], orig: (...a: any[]) => any) => {
            const [channelId, data] = args;
            if (!data || typeof data.content !== "string"
                || isE2EEMessage(data.content)
                || !enabledChannels.has(channelId)) {
                return orig(...args);
            }
            return runExclusive(channelId, () => onSend(channelId, data))
                .then(result => {
                    if (result?.cancel) return undefined;
                    return orig(...args);
                });
        }) as unknown as () => void;

        editUnpatch = patcher.instead("editMessage", MessageActions, (args: any[], orig: (...a: any[]) => any) => {
            const [channelId] = args;
            const block = onEdit(channelId, args);
            if (block === false) return undefined;
            return orig(...args);
        }) as unknown as () => void;
    } catch (e) {
        log.error("Failed to patch message actions", e);
    }

    // Incoming via Flux.
    try {
        fluxUnsub = (globalThis as any).bunny.api.flux.intercept(fluxInterceptor) as unknown as () => void;
    } catch (e) {
        log.error("Failed to attach flux interceptor", e);
    }

    // Lock button in the chat input action row.
    setupLockButton();

    log.info("E2EE plugin started");
}

function stop() {
    // Drop the derived vault key so disabling the plugin actually re-locks
    // the data instead of leaving it readable until Discord restarts.
    vaultKey = null;
    vaultLocked = vaultActive;

    try { sendUnpatch?.(); } catch { }
    try { editUnpatch?.(); } catch { }
    try { fluxUnsub?.(); } catch { }
    try { chatInputUnpatch?.(); } catch { }
    if (chatInputRetry) { clearInterval(chatInputRetry); chatInputRetry = null; }
    chatInputUnpatch = null;
    sendUnpatch = null;
    editUnpatch = null;
    fluxUnsub = null;
    stateSubscribers.clear();

    log.info("E2EE plugin stopped");
}

/*
 * Loader contracts:
 *   • Plugin Browser (bunny): runs inside
 *       (bunny, definePlugin) => { <code>; return plugin?.default ?? plugin; }
 *     — calls start()/stop() on the returned instance.
 *   • Vendetta URL-install: `vendetta=>{return <bundle>}` — calls
 *       onLoad()/onUnload() and reads .settings for the settings page.
 *     The instance below carries both contracts.
 */
declare const definePlugin: undefined | ((p: any) => any);

const instance = {
    start, stop, SettingsComponent,
    settings: SettingsComponent,
    onLoad: start,
    onUnload: stop,
};
(globalThis as any).plugin = instance;
(globalThis as any).__e2eeInstance = instance;
try {
    if (typeof definePlugin === "function") definePlugin(instance);
} catch { }
