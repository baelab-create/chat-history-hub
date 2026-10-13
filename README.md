# Chat History Hub — manual collection

The owner requested collection only after clicking “이 PC에서 최신화”. The old Windows scheduled task and AI heartbeat stay disabled. Do not run the legacy automatic installers or collector/sync.mjs.

## Flow

1. Google/Firebase login unlocks the existing encrypted catalog. Page load reads saved metadata only.
2. A deliberate click opens chathistoryhub://sync/<random-256-bit-nonce> on the current PC.
3. A windowless launcher starts a short-lived server bound only to 127.0.0.1:41791. The URL alone does not collect. The server accepts an authenticated POST from the exact Hub origin and nonce. The browser may request permission for local access.
4. One observation reads the installed app's recent 50 + pinned entries and named local SQLite task metadata. No app navigation, computer use, model calls or conversation body storage. The installed app bridge is version dependent, not a public consumer ChatGPT history API.
5. The helper returns public-key-encrypted metadata, then exits. It has no Firebase token or GitHub credential requirement. No timer, startup service or scheduled task is installed.
6. The browser writes ciphertext to private/chatHistoryHub/devices/{deviceId} in the existing owner-only Firebase project. Other devices load it on page open or “공유 목록 불러오기”. No realtime listener or periodic browser refresh is used.

GitHub Pages hosts code and the legacy encrypted catalog. No new plaintext titles are published. Existing Firebase owner rules are reused; ledger/dashboard collections are untouched. A failed cloud write preserves the local encrypted result with an explicit retry button. Anonymous reads must remain denied.

## Limits

- Partial, accumulating index, not complete cloud history or deletion mirroring.
- Sharing a local title does not transfer its body or workspace. The original PC/app must have access to the task.
- Local links appear after this browser successfully collects from its own device.
- Title aliases stay encrypted in this browser; they do not rename ChatGPT conversations.
- Windows uses the installed pythonw.exe and disables child windows. macOS uses an LSUIElement app. No simulated input or window activation is used for collection. Permission dialogs occur only at the explicit click.
- When input is focused as a response arrives, “새 목록 적용” defers rebuilding the list until a deliberate click.
- Cancel stops waiting/uploading. A local request already started may complete before the bounded helper exits.

## Installation and validation

Use Install-Manual-Windows.cmd or sh Install-Manual-Mac.command. Requires Node.js 22+ and Python 3. Windows looks for the installed Codex Node runtime. Existing device identity/history is preserved. Installation does not trigger collection.

Windows target: %LOCALAPPDATA%/ChatHistoryHubManual. Mac target: ~/Library/Application Support/ChatHistoryHubManual, with URL handler in ~/Applications. Mac packaging has not been verified on a Mac.

Run node --test tests/*.test.mjs. Verify origin/nonce rejection, exactly one observation, automatic listener shutdown, encryption/tamper checks, preservation of old history, and focused-input protection. Browser checks use an isolated headless browser, never the user's Chrome.

Do not claim a live Firebase write or browser permission flow passed unless observed. Do not turn this manual collector into a scheduled job.
