# My conversation index

A personal conversation index with Google sign-in. Firebase owner-only access supplies the key to decrypt the catalog in the browser. This public repository contains no plaintext conversation catalog, unlock secret, or original conversation text.

The ChatGPT catalog accumulates recent desktop-app observations through a scheduled collector. The collector needs its host PC and desktop app running. The page checks for newly published encrypted data every minute and on return to the page, while keeping the last valid list on connection failure. Collection time and delayed collection are visible. Previously collected conversations are retained when they leave the recent list; this is not a full historical account export or a deletion mirror.

Imported Gemini/Claude lists and title aliases remain encrypted in the browser where they were added; their automatic collection and cross-device synchronization are not implemented.

## Multiple computers

The original `catalog.enc.json` remains the desktop collector's catalog. Each additional computer publishes a separate `devices/<random-id>.enc.json`; `devices/index.json` contains only random IDs. The page merges by service and conversation ID, keeps the newest metadata, labels the contributing computers, and supports a device filter. A missing item is never treated as a deletion. One device's failure does not remove another device's records. Last-good device envelopes are cached encrypted in the browser.

`app.js`, `vault.js`, `google-auth.js`, and the device modules now run directly as browser modules. `index.html` is no longer a generated bundle. **Legacy collectors must update only `catalog.enc.json`, not regenerate/overwrite the website files.**

### Connect a Mac or Windows computer

1. Install Node.js 22+, Python 3, and GitHub CLI. Sign GitHub CLI into the repository owner's account (`gh auth login`).
2. Download/clone this repository. Open the website and sign in normally. Expand **새 기기 수집기 연결** and copy its public recipient key.
3. Create the git-ignored `private/collector/config.json`:

   ```json
   {"deviceName":"맥북","recipient":"PUBLIC_KEY_FROM_THE_PAGE","repository":"baelab-create/chat-history-hub","python":"python3","gh":"gh"}
   ```

4. Run `node collector/sync.mjs --local-only` to check collection, then `node collector/sync.mjs` to publish. Use absolute Python/GitHub CLI paths when running from an OS scheduler. Schedule every five minutes with launchd (Mac) or Task Scheduler (Windows), using the same OS account as the app.
5. On Mac, run `node scripts/install-macos.mjs` to install the five-minute LaunchAgent. It copies the collector to `~/Library/Application Support/ChatHistoryHub` and installs `~/Library/LaunchAgents/com.baelab.chat-history-hub.plist`. If a sandbox blocks service startup, run the displayed bootstrap command in Terminal or sign out/in. To stop: `launchctl bootout gui/$(id -u)/com.baelab.chat-history-hub`; remove that plist to disable future login startup.
6. Refresh the website after GitHub Pages finishes deploying. The new device appears automatically. Do not copy `private/collector/identity.json` to a different computer; each computer needs a unique ID.

### Collection boundaries

The automatic collector reads only **named local task metadata** from the app's local SQLite state database, opened read-only. It selects `id`, `name`, `updated_at`, and `archived`, excluding subagents. It does not read previews, prompts, messages, rollout files, authentication files, or issue model requests. This local database is an internal app format: unknown schemas fail closed and preserve previous records. `probe-local.mjs` remains the separate app-server feasibility probe.

Ordinary ChatGPT web conversations belong to the account, rather than an individual computer. The existing desktop collector continues updating those. A title-only observation obtained through the desktop app's list tool can also be supplied as `private/collector/cloud-observation.json` (`{"observedAt":"ISO_DATE","items":[{"id":"CONVERSATION_ID","kind":"chatgpt","title":"TITLE","updatedAt":1700000000,"archived":false}]}`). This is a partial observation, **not an automatic cloud collector or a full account export**. The page shows its observation time separately from the local collector time. No browser session tokens are extracted. Missing/archived conversations are retained, with no automatic deletion mirroring.

### Encryption and concurrency

Only public recipient material is needed on additional computers. The signed-in page derives its X25519 recipient identity from the existing catalog secret using domain-separated PBKDF2-SHA256 (600,000 iterations). Each snapshot uses a fresh ephemeral X25519 key, HKDF-SHA256, and AES-256-GCM with the device ID authenticated as additional data. Titles, device names, projects, and dates are encrypted before publishing; GitHub sees opaque ciphertext, random device IDs, public keys, and commit times. Existing Google/Firestore permissions are unchanged.

The collector publishes only its encrypted file and the merged registry in one Git commit. Non-fast-forward updates retry from the latest main branch, preserving concurrent device/desktop changes. Local snapshot and pending ciphertext survive network errors. A lock prevents overlapping local collectors. After a crash, check that no collector process remains before removing `private/collector/sync.lock`.

Run `node --test tests/*.test.mjs` for encryption, validation, merging, and retention tests. Changing the Google vault's unlock secret changes the recipient key: reconnect collectors and republish retained snapshots after such a rotation.

On macOS, collector code, working directory, and logs live under Application Support because background agents may be denied access to Documents. A successful `launchctl bootstrap` means registration only. Verify `private/collector/last-success.json` advances and the service log reports `uploaded:true`; a nonzero launchd exit code is not a successful sync. Reinstallation migrates the previous Documents installation while preserving its device ID and collected metadata.
