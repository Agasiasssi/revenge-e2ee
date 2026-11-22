# E2EE for Revenge

End-to-end encryption for Discord DMs, for [Revenge](https://github.com/revenge-mod/revenge-xposed) (Xposed client mod for Android). Port of [tobi437a/vencord-E2EE](https://github.com/tobi437a/vencord-E2EE) — the desktop Vencord plugin.

Signal-style **Double Ratchet** (X25519 + HKDF-SHA256 + AES-256-GCM), protocol **v2**, **wire-compatible** with the Vencord desktop build: a phone on Revenge and a desktop on Vencord can hold an encrypted conversation.

## Desktop (Vencord / Vesktop) — the original

`vencord/` holds the **desktop plugin source** (copied from [tobi437a/vencord-E2EE](https://github.com/tobi437a/vencord-E2EE), the original by Tobi) and `vencord/dist/` holds a **ready-built Vencord dist** with the E2EE plugin bundled — the exact build running on Vesktop here. Protocol v2 is identical on both platforms, so desktop and Android can talk securely to each other.

**Ready-built install (Vesktop):**
1. Copy `vencord/dist/` somewhere persistent, e.g. `~/.config/vesktop/vencord-dist`
2. Vesktop → Settings → Vencord Location → Change → select that folder (Flatpak: `state.json` → `"vencordDir"` must be the sandbox-visible path)
3. Enable **E2EE** in Vencord's plugin settings, restart

**From source:** drop `vencord/` into `Vencord/src/userplugins/E2EE/`, then `pnpm i && pnpm build` per the [Vencord custom plugins docs](https://docs.vencord.dev/installing/custom-plugins/).

> The desktop dist is a build artifact (includes sourcemaps); rebuild it from source whenever the plugin or Vencord updates.

## Install (Revenge Xposed 1.9.x)

1. Discord → **Settings → Plugins** → **Plugin Browser** → tap the **+** in the top-right → **Add Repository...** and enter:

   ```
   https://raw.githubusercontent.com/Agasiasssi/revenge-e2ee/main/
   ```

   (trailing slash matters — Revenge fetches `repo.json` relative to it)

2. Install **E2EE** from the browser, enable it, restart Discord.
3. Open a DM, tap the **lock button** in the chat input bar:
   - 🔓 off → tap to invite (sends a handshake message)
   - 🟡 waiting for the other side to accept
   - 🔒 active — messages are end-to-end encrypted
   - ⚠️ the other side's identity key **changed** — compare the safety number before trusting it
   - 🔑 vault is locked — enter your password

Alternative (Install from URL): paste `https://raw.githubusercontent.com/Agasiasssi/revenge-e2ee/main/vd` into the URL-install box — that loads the same plugin through Revenge's Vendetta-compatible installer.

Works in **1:1 DMs only**. Both sides need the plugin (desktop: the Vencord build) at the same protocol version, or messages render as placeholders instead of text.

> Note: this plugin targets the Bunny plugin system your Revenge ships today. The newer `index.json` repository format (in `index.json`/`pool/` here) is for the next-gen Revenge loader and is kept for forward compatibility.

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

- `bunny-src/` — the plugin as installed by Revenge 1.9.x (Bunny loader). Bundle it with [bun](https://bun.sh):

  ```sh
  bun install
  bun build bunny-src/index.ts --format=iife --target=browser --outfile=builds/com.tobi437a.e2ee/index.js
  ```

- `plugins/com.tobi437a.e2ee/` — the Revenge-next (Vencord-style) variant; drop it into [revenge-plugin-template](https://github.com/revenge-mod/revenge-plugin-template) and `bun run build com.tobi437a.e2ee`.

Both share the same crypto/session core (`bunny-src/{crypto,session,vault,serial,compress}.ts`).

## Distribution layout

```
repo.json                              # Bunny plugin repository (Plugin Browser)
builds/com.tobi437a.e2ee/              # Bunny artifact: manifest.json + index.js
vd/                                    # Vendetta URL-install: manifest.json + index.js
index.json + pool/                     # Revenge-next repository (forward-compatible)
```

To release an update: bump `version` in both manifests, rebuild, and regenerate `index.json`:

```sh
bunx revenge-plugin generate-index --dist pool --base-url https://raw.githubusercontent.com/Agasiasssi/revenge-e2ee/main/pool --out index.json
```

## Distribution

`index.json` + `pool/` on this branch form a Revenge plugin repository. The install URL above is that index. After rebuilding, bump `version` in `manifest.json`, repackage the zip into `pool/<id>@<version>.zip`, and regenerate the index:

```sh
bunx revenge-plugin generate-index --dist pool --base-url https://raw.githubusercontent.com/Agasiasssi/revenge-e2ee/main/pool --out index.json
```

## License

GPL-3.0-or-later, same as the original plugin. Original by Tobi ([tobi437a/vencord-E2EE](https://github.com/tobi437a/vencord-E2EE)); Revenge port adapts its code and protocol.
