#!/bin/sh
# Spec 030: the people-owned files that go with feat/030-connections-redesign. Agents may not edit them, so a person
# runs this from the repo root, then reviews it with git diff and commits it on the branch:
#   sh specs/030-connections-redesign/people-files.sh
# It needs the two designs where they were handed over, in ~/Downloads.
set -e
cd "$(dirname "$0")/../.."
page="$HOME/Downloads/10 · Settings › Connections (redesign)-html.zip"
dialog="$HOME/Downloads/10a · Connection dialog, all states-html.zip"
[ -f "$page" ] || { echo "Not found: $page"; exit 1; }
[ -f "$dialog" ] || { echo "Not found: $dialog"; exit 1; }

# 1. The designs (Q1): each HTML export needs the files beside it, so each gets a folder of its own.
for pair in "connections|$page" "connection-dialog|$dialog"; do
  folder="docs/design/screens/${pair%%|*}"
  rm -rf "$folder"
  mkdir -p "$folder"
  unzip -q -o "${pair#*|}" -d "$folder"
done

python3 - <<'PY'
import re

path = 'docs/design/design-system.md'
s = open(path).read()
if '### Connections\n' in s:
    raise SystemExit(f'{path} already has a Connections section, so nothing was changed.')

# 2. design-system.md: the new parts' CSS, from the design's bundle, at the end of components.css.
css = open('docs/design/screens/connections/ds/devhub/bundle.css').read()
picked = [line for line in css.split('\n') if re.match(r'\.dh-(conn|status-btn|kv|flow-num|dialog)\b', line)]
fence = s.index('```css', s.index('### components.css'))
end = s.index('\n```', fence + 6)
s = s[:end] + '\n\n/* Spec 030: Settings › Connections rows, status buttons, the connection dialog, details and steps. */\n' + '\n'.join(picked) + s[end:]

# 3. A Connections section before Callout.
section = (
    '### Connections\n\n'
    'Settings › Connections lists each tool in one panel (`dh-panel`). A row (`dh-conn`) holds a 40 px mark '
    '(`dh-conn-mark`), the name with one line under it, and a round 36 px status button (`dh-status-btn`). The button\'s '
    'look says the state: Connected (`--ok`, a check), Needs reconnecting (`--warn`, a circular arrow), Not connected '
    '(`--off`, dashed, a plug). A key under the list spells the three out, and the button\'s tooltip and name say it too, '
    'so colour is never the only signal.\n\n'
    'The button opens the tool\'s dialog (`dh-dialog`, 520 px): `dh-dialog-head` with the mark, the name and a state pill; '
    '`dh-dialog-body`; `dh-dialog-foot`. Details sit in a key and value list (`dh-kv`), numbered steps in `dh-flow-num`. '
    'The dialog has one primary button at most. Disconnect sits alone at the start of the foot and always asks first.\n\n'
)
anchor = '### Callout\n'
if s.count(anchor) != 1:
    raise SystemExit(f'{path}: expected one "{anchor.strip()}", so nothing was changed.')
s = s.replace(anchor, section + anchor, 1)
open(path, 'w').write(s)
PY

npx --no-install prettier --write docs/design/design-system.md >/dev/null
echo 'Done. Check with: git status && git diff docs/design/design-system.md'
