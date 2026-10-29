# Chat History Hub — manual collection

Collection starts only from the user's explicit action. Keep the old scheduled task,
AI heartbeat and collector/sync.mjs disabled. Page load, focus, online and visibility
changes must never collect new history.

## Current browser flow (extension 1.4.0)

1. Google/Firebase login unlocks existing encrypted metadata. Page load only reads
   saved records; no new ChatGPT capture starts without an explicit action.
2. “최신화” uses the versioned bridge to start a quick refresh with no review step.
   The extension creates its own inactive ChatGPT home tab, waits at most 45 seconds
   for the sidebar, opens only recognized sidebar controls if needed, and reads the
   recent titles, URLs and allowlisted React dates. No cookies, body text or APIs.
   This deliberately loads a fresh page instead of reloading a user's draft tab.
3. Hub validates, encrypts, accumulates and saves that result automatically. Search
   and date filters remain intact; the ChatGPT service is shown. Storage failures
   retain an encrypted IndexedDB outbox for explicit retry, before cloud writes.
4. The temporary tab closes only if it stayed inactive/unvisited and is still at
   the exact created home URL. Login tabs and user-visited tabs are kept. Login or
   unsupported page layouts return actionable errors, never a false success.
5. An abort or closed Hub invalidates the worker request. Checks before capture and
   delivery prevent cancelled results from reaching persistence. No other tabs are
   navigated or closed. There are no scheduled/focus/visibility-triggered captures.
6. “설정 및 가져오기” holds connection/update instructions, device filters, date
   basis, export/bookmark fallback and the optional review/history scan. Only this
   advanced path asks users to select a ChatGPT tab and apply a preview.
7. “저장 목록 다시 불러오기” only reads existing records. A connection probe only
   checks the extension version. Neither initiates collection.
8. Firebase still stores ciphertext under private/chatHistoryHub/devices/{deviceId}
   with the existing owner-only rules. No permissions or collection rules changed.

This quick refresh is a partial, accumulating recent list for the current ChatGPT
browser account/workspace, not a full-account history sync. The user supplied a
screenshot showing 37 dates captured by 1.3; the NEW automatic 1.4 flow has only
synthetic validation, not a live signed-in Chrome test. Installing/updating the
unpacked extension is a one-time user step; site deployment cannot perform it.

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

## Full first-install distribution (1.4.1)

setup/chat-history-hub-1.4.1.zip is a complete, versioned package for a fresh
Chrome installation on either Windows or macOS. The existing unversioned download
is the same package. No prior installation or patch files are needed. Each ZIP
contains the whole extension directory, toolbar popup/icons and INSTALL-KO.txt.
The install page leads with fresh installation; updates are a collapsed alternative.

Users extract, move the folder to a permanent location, then load that folder in
chrome://extensions with developer mode. They repeat that registration per PC and
Chrome profile. The toolbar popup only opens Hub/help; it performs no collection.
Use the same Hub Google account to load shared encrypted records, and the same
ChatGPT account/workspace to collect the same history. No local task bodies sync.

The builder validates every declared manifest entry, relative JS import and local
HTML asset before creating both ZIPs. It checks icon PNG dimensions, guide/popup
version and exact packaged-source parity in CI. This release changes packaging and
onboarding; it does not claim live signed-in capture or native installation tests.
The quick-refresh protocol still accepts extension 1.4.0.

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

The default view groups confirmed activity dates in Asia/Seoul. Explicit creation
and modification views remain available. Unknown dates stay unknown.
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

## React date capture (1.3.0)

The user requested the approach used by Hangzhi/chatgpt-timestamp-extension.
The committed-fiber timestamp approach is adapted under MIT; its license is included
in the extension ZIP and embedded in the generated standalone bookmark. No periodic
collection, private API calls, new permissions or body capture are added.

- Visible sidebar rows: inspect only known props wrappers with an exact conversation
  ID and a title; accept explicit creation/modification fields. Never derive dates
  from UUIDs, sidebar ranks, capture time, message objects, or mismatched chats.
- Open conversation: match current conversation ID, DOM message ID, committed React
  owner, and (for the new shell) live turn/snapshot identity. Read only user-message
  creation times, never content. These observations populate lastMessageAt, never
  updatedAt or createdAt. No background navigation opens other conversations.
- Hub: v2 date payloads require evidence tags and bounded numeric timestamps. Existing
  v1 bookmarks remain readable with a replacement notice. Later captures that lack
  dates retain previously known dates. Scanned repeated rows merge date evidence.
- Activity view uses the newest known modification, creation, or loaded user-message
  time, with a visible source label for message/creation fallback. Exact creation
  and modification filters do not substitute message time.

This is an adapter for undocumented page internals, not a verified connection to all
account history. Supported sidebar prop shapes and both message layouts are covered
by synthetic fixtures only. A real signed-in ChatGPT capture has NOT been validated.
The page may not expose dates for every loaded row. Report missing dates instead of
claiming a full account sync. Existing bookmarks contain old embedded code and must
be replaced once; existing unpacked extensions must be updated once to 1.4.0 for one-click refresh.
