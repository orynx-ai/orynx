#!/bin/sh
# Spec 029: the people-owned files that go with feat/029-notifications. Agents may not edit them, so a person runs
# this from the repo root, then reviews it with git diff and commits it on the branch:
#   sh specs/029-notifications/people-files.sh
# It needs the two designs where they were handed over, in ~/Downloads.
set -e
cd "$(dirname "$0")/../.."
pdf="$HOME/Downloads/8 · Notification centre and pop-ups.pdf"
zip="$HOME/Downloads/9 · Settings › Notifications-html.zip"
[ -f "$pdf" ] || { echo "Not found: $pdf"; exit 1; }
[ -f "$zip" ] || { echo "Not found: $zip"; exit 1; }

# 1. The designs (Q5): the panel as a picture, Settings › Notifications as its HTML export, which needs the files
#    beside it, so it gets a folder of its own.
sips -s format png "$pdf" --out docs/design/screens/notifications.png >/dev/null
rm -rf docs/design/screens/notification-settings
mkdir -p docs/design/screens/notification-settings
unzip -q -o "$zip" -d docs/design/screens/notification-settings

python3 - <<'PY'
import re

def edit(path, edits):
    s = open(path).read()
    for old, new in edits:
        if old not in s:
            raise SystemExit(f'{path}: not found, so nothing was changed: {old[:70]}')
        s = s.replace(old, new, 1)
    open(path, 'w').write(s)

# 2. design-system.md: the principle Q3 rewords, the new parts (Q5), and their CSS from the design's bundle.
css = open('docs/design/screens/notification-settings/ds/devhub/bundle.css').read()
picked = [line for line in css.split('\n') if re.match(r'\.dh-(switch|bell|notif|toast|range|perm)\b', line)]
s = open('docs/design/design-system.md').read()
fence = s.index('```css', s.index('### components.css'))
end = s.index('\n```', fence + 6)
s = s[:end] + '\n\n/* Spec 029: the bell, its panel, pop-ups, switches, the volume slider and setting rows. */\n' + '\n'.join(picked) + s[end:]
open('docs/design/design-system.md', 'w').write(s)
edit('docs/design/design-system.md', [
    ('Approval prompts sit inline where the work is, not in pop-ups.',
     'Approval prompts sit inline where the work is. A waiting command can also be allowed once from its notification.'),
    ('### Callout\n',
     '### Notifications\n\n'
     'The bell (`dh-bell`, with a red `dh-bell-count`, 99+ above 99) sits at the bottom of the sidebar, after the person '
     'and Claude\'s state; on the rail above the avatar, and under 768 px in the top bar before Search. It opens a 372 px '
     'panel (`dh-popover`): Notifications with Mark all read, settings and Close; All and Needs you tabs; Today and Earlier '
     'groups (`dh-notif-group`); rows (`dh-notif`: a 28 px icon in its tone, the title, the detail, the time, an unread dot); '
     'and a foot with Do not disturb, Sounds and All settings. A waiting command offers Allow once and Review; anything '
     'else Claude waits for offers Review only.\n\n'
     'Pop-ups (`dh-toast`, 380 px, a warning outline for an approval) stack in the bottom-right corner, newest at the bottom, '
     'three at most. An approval is an alert and stays until answered; anything else goes after 8 seconds, never while '
     'the pointer or focus is on it.\n\n'
     'Settings rows (`dh-panel` around `dh-perm`): a title, one line under it, the control at the end. A switch (`dh-switch`) '
     'turns a setting on or off; the volume is a range (`dh-range`).\n\n'
     '### Callout\n'),
])

# 3. docs/product/spec.md: the Settings tab and what it sets.
s = open('docs/product/spec.md').read()
s = s.replace('Connections · Coding agent · ', 'Connections · Coding agent · Notifications · ', 1) if '· Notifications ·' not in s else s
s = re.sub(r'Settings has (five|six) tabs', lambda m: 'Settings has ' + {'five': 'six', 'six': 'seven'}[m.group(1)] + ' tabs', s, count=1)
open('docs/product/spec.md', 'w').write(s)
edit('docs/product/spec.md', [
    ('| Repositories | Local folders Claude may work in',
     '| Notifications | Pop-ups, desktop notifications and sounds for each kind of event; Do not disturb and quiet hours. Everything is always listed under the bell at the bottom of the sidebar | Pop-ups and sounds on; desktop notifications when Orynx isn\'t in view; quiet 19:00–09:00 on weekdays |\n'
     '| Repositories | Local folders Claude may work in'),
])
print('Updated for spec 029. Review with: git status docs && git diff docs')
PY
