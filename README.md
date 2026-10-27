# Chat History Hub — manual collection

Collection starts only from the user's explicit action. Keep the old scheduled task,
AI heartbeat and collector/sync.mjs disabled. Page load, focus, online and visibility
changes must never collect new history.

## Current browser flow (extension 1.2.0)

1. Google/Firebase login unlocks the existing encrypted catalog. The page loads saved
   metadata from GitHub, browser cache and the existing private Firebase collection.
2. “수집기 연결 확인” performs a versioned worker handshake only. It cannot collect.
3. “최신화” opens review in the installed Chrome extension. The user selects their
   ChatGPT tab and chooses quick visible-recent capture or a bounded history scan.
4. The serialized collector supports Work's Recent sections and the standard browser
   history container. It reads rendered titles and conversation links only. Missing
   or collapsed supported containers fail closed; no body or private API fallback.
5. “이 목록을 Hub에 반영” validates, shards and encrypts metadata in the signed-in
   Hub. Existing titles are retained, and search/date filters are preserved.
6. Encrypted archives and the failed-upload queue use IndexedDB, with legacy
   localStorage migration/fallback. New captures merge into a pending queue instead
   of replacing it. Queue writes complete before cloud writes; retries are explicit.
7. Firebase stores ciphertext under private/chatHistoryHub/devices/{deviceId} with
   the existing owner-only rules. No other project collections or rules are changed.
8. “저장 목록 다시 불러오기” reads already-shared records; it does not collect new
   ChatGPT history. Closing review or cancelling releases the pending request.

## Optional bookmark capture (no extension installation)

setup/simple.html contains a self-contained bookmark generated from the same DOM
collector and public-key encryption code. Drag its button to Chrome's bookmark bar.
Click it on ChatGPT to capture up to 200 already-loaded sidebar entries and navigate
the same tab to Hub with ciphertext in the URL fragment. No titles enter query
parameters, requests to GitHub, or a plaintext download. No cookies or private APIs
are read. Hub clears the fragment, retains ciphertext in sessionStorage while login
completes, validates it after unlock, and requires a preview/apply click before
using the existing encrypted archive and cloud-save flow. Identity is assigned by
Hub's existing browser device key, so repeat captures do not create new archives.

This is a quick visible-list alternative, not a full-history scan. Browsers/site
CSP may block user bookmark execution; no bypass is attempted. Live signed-in
ChatGPT bookmark execution is unverified. Keep the extension path available.
Rebuild with node scripts/package-bookmark.mjs; CI checks generated-source parity.

## Updating the installed extension

GitHub Pages deployment does not update an unpacked extension on a user's PC.
Replace files in its installed directory, reload it in chrome://extensions, then
reload Hub. The UI rejects an unversioned/old bridge with this specific instruction.
See setup/browser.html. Build with python3 scripts/package-extension.py.

## Validation

Run npm ci, npm test and python3 scripts/package-extension.py --check. Tests cover
serialized DOM collection in both layouts, origin/version checks, cancellation,
retaining history, encrypted storage beyond localStorage quota, failed-upload merge,
and the complete app against its real HTML with synthetic account/cloud boundaries.
A push/PR check verifies tests and that the downloaded ZIP matches reviewed source.

node tests/manual-browser.mjs serves a local synthetic UI fixture at port 41792.
No real account or cloud data is used. Do not claim live Firebase writes, extension
installation, real account capture or native Mac/Windows validation without observing
those actions. This repair was tested with synthetic data; existing local helpers
remain legacy/manual, and are not invoked by the current browser button.

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

Run node --test tests/*.test.mjs. Verify origin/nonce rejection, exactly one observation, automatic listener shutdown, encryption/tamper checks, preservation of old history, and focused-input protection. Browser checks use the synthetic fixture, never private account data.

Do not claim a live Firebase write or browser permission flow passed unless observed. Do not turn this manual collector into a scheduled job.

## Exact dates from a user-selected ChatGPT export

The default view groups by the chosen date: modification or creation, in Asia/Seoul.
Sidebar/bookmark capture does not contain timestamps; unknown dates stay unknown.
The date import panel accepts conversations.json or a regular ZIP containing it.
ZIP reading uses the central directory and bounded native deflate decompression,
reads no unrelated member, checks size/CRC, and never uploads the raw file. ZIP64
and unsupported compression require extracting conversations.json first. JSON is
limited to 128 MiB and 50,000 conversations. Unsupported/missing timestamp rows
are counted and skipped; creation time is never used as modification time.

Only ID, title, create_time, update_time and archive flag are mapped into metadata.
A preview and explicit apply are required. Export metadata uses a separate stable
archive identity, existing encryption and the durable manual sharing queue. Merging
fills dates for already-captured titles; older exports cannot regress known dates,
and later bookmark capture preserves them. Import does not claim to refresh current
cloud timestamps: dates describe the export, and subsequent changes need a new file.
A date-range filter explicitly reports exclusion of records with unknown dates.
The export format is validated at runtime; no live user export has been tested.
