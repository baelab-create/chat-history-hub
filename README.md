# My conversation index

A personal conversation index with Google sign-in. Firebase owner-only access supplies the key to decrypt the catalog in the browser. This public repository contains no plaintext conversation catalog, unlock secret, or original conversation text.

The ChatGPT catalog accumulates recent desktop-app observations through a scheduled collector. The collector needs its host PC and desktop app running. The page checks for newly published encrypted data every minute and on return to the page, while keeping the last valid list on connection failure. Collection time and delayed collection are visible. Previously collected conversations are retained when they leave the recent list; this is not a full historical account export or a deletion mirror.

Imported Gemini/Claude lists and title aliases remain encrypted in the browser where they were added; their automatic collection and cross-device synchronization are not implemented.
