# Chat History Hub

Private title index on GitHub Pages, opened with the existing Google/Firebase owner login. Conversation bodies, passwords, login tokens, and plaintext catalogs are never published.

## Automatic connection

The Windows collector is installed as the current user's `ChatHistoryHub-TitleSync` scheduled task. It runs at sign-in and once a minute, without model requests or AI automations. It reads the recent 50 conversations plus pinned conversations through the app's installed read-only MCP list tool. It also reads named local task metadata from SQLite in read-only mode. The app must remain signed in and running for account conversation collection; local metadata is per device.

The connector uses the installed `codex-app-tools` bridge, not an inference API. It discovers the installed plugin and its local IPC connection again after disconnection. This is an app integration rather than a guaranteed public consumer-history API; app interface changes fail closed and are shown as delayed connection. No authentication database or browser cookies are read. Only whitelisted ID, kind, title, update time, project, and archive metadata survive normalization. Tool summaries are discarded immediately.

## Data flow and cost

Each PC has a unique random device ID and the vault's public encryption recipient key. It publishes an X25519/HKDF/AES-GCM encrypted snapshot and registry to the separate **catalog-data** branch. Normal data updates do not trigger GitHub Pages builds and incur no model/API inference cost. The existing Firebase configuration remains responsible only for Google sign-in and access to the unlock key.

Changes publish on the next successful check. Unchanged metadata sends a health observation at most every five minutes. The browser checks every minute and when revisited. GitHub cache propagation can add several minutes: this is automatic periodic synchronization, not a guaranteed instant stream. If no connected PC/app is running, new account conversations cannot be collected until it reconnects. Site refresh only loads published data.

The browser reads both legacy `main` device files and the new data branch, accepts newer observations, and caches last-good envelopes encrypted. Fresh local scans never make old cloud observations appear fresh. An automatic connection needs a recent successful account-list observation. Source/network errors retain the last published list. Concurrent GitHub updates retry without overwriting another device; a PID lock suppresses local overlap and recovers after dead processes.

## Another computer

See [the installation page](https://baelab-create.github.io/chat-history-hub/setup/) and the allowlisted collector ZIP. Windows: run `Install-Windows.cmd`. Mac: run `sh Install-Mac.command` from the extracted folder. Requires the desktop app, Node.js 22+ (the installed app runtime is reused where possible), Python 3, GitHub CLI, and GitHub CLI sign-in to the repository owner account. Google sign-in to the website is separate from the collector's GitHub publishing authorization.

Windows files live in `%LOCALAPPDATA%/ChatHistoryHub`. Its task is limited to the current interactive user, permits battery use, catches up after sleep, ignores overlapping runs, and stops a hung run after three minutes. `private/collector/last-check.json` records the most recent attempt; `last-success.json` records confirmed publishing. Logs contain counts and fixed error codes only. A bundled Node fallback survives removal of the app's runtime cache.

Mac files live in `~/Library/Application Support/ChatHistoryHub`, with LaunchAgent `com.baelab.chat-history-hub` running every minute. Mac installation is provided but has not been executed from this Windows computer. Preserve an existing device's identity on upgrade; do not copy it to another PC. Existing Mac collectors must be upgraded to collect ordinary ChatGPT titles automatically.

To stop Windows collection: disable `ChatHistoryHub-TitleSync` in Task Scheduler. To stop Mac collection: `launchctl bootout gui/$(id -u)/com.baelab.chat-history-hub`; removing its plist disables future login startup. The old AI automation remains paused.

## Coverage and privacy

Recent and pinned observations accumulate; this is not a full account export. Absence from a partial list, offline devices, or connection failures is never proof of deletion. Deletion mirroring is not implemented by this collector. Original historical items and browser-local title aliases remain preserved. Gemini/Claude are excluded from the displayed list; previously stored browser imports are left intact.

`catalog.enc.json` is the legacy baseline. Do not run the old frontend generator: the current site uses browser modules directly. Source code, public recipient key, and ciphertext may be published; `private/`, source observations, keys, and runtime logs must remain ignored. Rotating the vault secret requires reconnecting collectors to its new recipient key.

## Validation

Run `node --test tests/*.test.mjs` (or `--test-isolation=none` if subprocesses are sandboxed). Coverage includes metadata allowlisting, source failures, timestamp honesty, encrypted merge/retention, wrong keys/tampering, concurrency locking, and crash recovery. Verify real `last-success.json` advances through an OS-scheduled run before claiming automatic sync is connected.
