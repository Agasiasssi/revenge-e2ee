# E2EE for Revenge

End-to-end encryption for Discord DMs, for [Revenge](https://github.com/revenge-mod/revenge-xposed) (Xposed client mod for Android). Port of [tobi437a/vencord-E2EE](https://github.com/tobi437a/vencord-E2EE) — the desktop Vencord plugin.

Signal-style **Double Ratchet** (X25519 + HKDF-SHA256 + AES-256-GCM), protocol **v2**, **wire-compatible** with the Vencord desktop build: a phone on Revenge and a desktop on Vencord can hold an encrypted conversation.

## Install

1. Open **Revenge → Repositories → Add repository** and enter:

   ```
   https://raw.githubusercontent.com/Agasiasssi/revenge-e2ee/main/index.json
   ```

2. Open the plugin list, install **E2EE**, enable it, restart Discord.
3. Open a DM, tap the **lock button** in the chat input bar:
   - 🔓 off → tap to invite (sends a handshake message)
   - 🟡 waiting for the other side to accept
   - 🔒 active — messages are end-to-end encrypted
   - ⚠️ the other side's identity key **changed** — compare the safety number before trusting it
   - 🔑 vault is locked — enter your password

Works in **1:1 DMs only**. Both sides need the plugin (desktop: the Vencord build) at the same protocol version, or messages render as placeholders instead of text.

## What it protects

- Message **content** in enabled DMs (text only — files/attachments are NOT encrypted).
- Identity pinning (TOFU): if your friend's identity key changes, the plugin refuses to send until you compare the safety number and explicitly trust the new key.
- Optional **vault**: password-encrypts the saved identity, sessions and decrypted-message cache at rest (PBKDF2-SHA256, 600k iterations). If you forget the password, the saved data is unrecoverable — there is no reset.

## Known limitations (Android build)

- **RNG**: Revenge's runtime (Hermes) ships no WebCrypto. If `crypto.getRandomValues` is absent at runtime, key generation falls back to a SHA-256 entropy pool and security is reduced (a warning is logged at startup). A native (Kotlin `SecureRandom`) variant is the proper fix.
- Message decorations are skipped (no lock badge / no "not encrypted" notice under messages; an unencrypted message arriving in an encrypted DM raises a toast instead).
- Edits of encrypted messages are blocked (the ratchet cannot re-key an old message).
- PBKDF2 runs in JavaScript — unlocking the vault takes a few seconds on a phone.

## Build from source

This repo holds the plugin as a [revenge-plugin-template](https://github.com/revenge-mod/revenge-plugin-template) plugin folder. To rebuild:

```sh
git clone https://github.com/revenge-mod/revenge-plugin-template
cp -r plugins/com.tobi437a.e2ee <template>/plugins/
cd <template> && bun install && bun run build com.tobi437a.e2ee
```

The artifact is `plugins/com.tobi437a.e2ee/build/js/index.js`; package it as a ZIP next to `manifest.json` (that is what `pool/` holds here).

## Distribution

`index.json` + `pool/` on this branch form a Revenge plugin repository. The install URL above is that index. After rebuilding, bump `version` in `manifest.json`, repackage the zip into `pool/<id>@<version>.zip`, and regenerate the index:

```sh
bunx revenge-plugin generate-index --dist pool --base-url https://raw.githubusercontent.com/Agasiasssi/revenge-e2ee/main/pool --out index.json
```

## License

GPL-3.0-or-later, same as the original plugin. Original by Tobi ([tobi437a/vencord-E2EE](https://github.com/tobi437a/vencord-E2EE)); Revenge port adapts its code and protocol.
