#!/bin/sh
# Spec 020: brings docs/product/spec.md (people-owned) in line with what feat/020-first-use-feedback built.
# Agents may not edit that file, so a person runs this: sh specs/020-first-use-feedback/product-spec-edits.sh
# from the repo root, then reviews it with git diff and commits it on the branch.
set -e
cd "$(dirname "$0")/../.."
python3 - <<'PY'
p = 'docs/product/spec.md'
s = open(p).read()
edits = [
    ('2. **New task** (⌘N) and **Search** (⌘K, searches tickets, PRs, messages and sessions).',
     '2. **Search** (⌘K, searches tickets, PRs, messages and sessions). New task left the sidebar: Home does its job, and ⌥⌘N (⌘N in the desktop app) still opens Home.'),
    ('3. Places: Home (count of items needing you), Tickets (count in sprint), Settings.',
     '3. Places: Home (count of items needing you), Tickets (count in sprint), Settings. Collapsed, the rail adds Sessions, and every icon shows its name in a tooltip.'),
    ('4. **Sessions**: the five most recent Claude sessions,',
     '4. **Sessions**: every recent Claude session, 16 at a time, the next 16 loading as you scroll to the end,'),
    ('| Jira | Assigned to me and not Done | Due date, or "Bug" for high-priority bugs | Build with Claude |',
     '| Jira | Assigned to me and not Done | Due date, or "Bug" for high-priority bugs | Ship, Open in Jira (icons) |'),
    ('| Sparkle (Build with Claude) |', '| Sparkle (Ship) |'),
    ('**What happens when you click Build with Claude or Send**', '**What happens when you click Ship or Send**'),
]
for old, new in edits:
    if old not in s:
        raise SystemExit(f'Not found, so nothing was changed: {old[:60]}')
    s = s.replace(old, new)
open(p, 'w').write(s)
print('docs/product/spec.md updated for spec 020. Review it with: git diff docs/product/spec.md')
PY
