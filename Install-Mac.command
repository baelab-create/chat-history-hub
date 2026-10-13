#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
for node in "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" /opt/homebrew/bin/node /usr/local/bin/node
do
 if [ -x "$node" ]; then exec "$node" "$root/scripts/setup-macos.mjs"; fi
done
printf '%s\n' 'Node.js is needed. Open ChatGPT once, or install Node.js 22 or newer.'
exit 1
