#!/bin/sh
# Spec 035: the people-owned files that go with feat/035-sync-activity. Agents may not edit them, so a person
# runs this from the repo root, then reviews it with git diff and commits it on the branch:
#   sh specs/035-sync-activity/people-files.sh
# It needs the design where it was handed over, in ~/Downloads.
set -e
cd "$(dirname "$0")/../.."
design="$HOME/Downloads/10b · Sync activity (modal)-html.zip"
[ -f "$design" ] || { echo "Not found: $design"; exit 1; }

# 1. The design (spec 035's Design section): the HTML export needs the files beside it, so it gets a folder.
folder="docs/design/screens/sync-activity"
rm -rf "$folder"
mkdir -p "$folder"
unzip -q -o "$design" -d "$folder"

# 2. design-system.md: a Sync activity section before Callout, for the parts spec 035 added (Q2, Q4).
python3 - <<'PY'
path = 'docs/design/design-system.md'
s = open(path).read()
if '### Sync activity\n' in s:
    raise SystemExit(f'{path} already has a Sync activity section, so nothing was changed.')

section = (
    '### Sync activity\n\n'
    'The sync log opens from Home\'s page bar ("Sync activity", a secondary small button with a red dot while a tool '
    'needs attention) in a wide dialog: up to 1100 × 860 px, the 16 px gutter on a smaller window. A 280 px list of '
    'tools on the sidebar tint sits beside the picked tool\'s detail; under 768 px the list sits above it and the '
    'whole body scrolls.\n\n'
    'The list starts with All activity, then groups the tools under a heading with its count: Needs attention, '
    'Syncing fine, Not connected. Each tool shows its mark, its name, one line under it (in red while it fails) and '
    'an 8 px status dot: green for worked, amber for needs attention, red for failed, an empty ring for off. The dot '
    'is never the only signal: the name says the state too.\n\n'
    'The detail holds the tool\'s mark, name and status line with Sync now; a problem callout (red when only you can '
    'fix it, amber when Orynx gets past it on its own) with Reconnect and Retry; four stat tiles at least 150 px wide, '
    'split by hairlines in one rounded box; and the History, with All and Failed. A history row is one button across '
    'the row (dot, time, summary, duration, chevron) that opens in place to what the sync found, each change with an '
    'Open link, or to what went wrong with Copy.\n\n'
)
anchor = '### Callout\n'
if s.count(anchor) != 1:
    raise SystemExit(f'{path}: expected one "{anchor.strip()}", so nothing was changed.')
s = s.replace(anchor, section + anchor, 1)
open(path, 'w').write(s)
PY

npx --no-install prettier --write docs/design/design-system.md >/dev/null
echo 'Done. Check with: git status && git diff docs/design/design-system.md'
