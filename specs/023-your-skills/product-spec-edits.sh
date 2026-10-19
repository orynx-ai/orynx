#!/bin/sh
# Spec 023: brings docs/product/spec.md (people-owned) in line with what feat/023-your-skills built.
# Agents may not edit that file, so a person runs this: sh specs/023-your-skills/product-spec-edits.sh
# from the repo root, then reviews it with git diff and commits it on the branch.
set -e
cd "$(dirname "$0")/../.."
python3 - <<'PY'
p = 'docs/product/spec.md'
s = open(p).read()
edits = [
    ('| Connections · Coding agent · Repositories · Inbox rules · Appearance |',
     '| Connections · Coding agent · Skills · Repositories · Inbox rules · Appearance |'),
    ('Settings has five tabs; changes save as you make them.',
     'Settings has six tabs; changes save as you make them, except a skill, which saves when you press Save skill.'),
    ('| Coding agent | Which agent (Claude now, more later); what Claude may do without asking | "Edit files freely, ask before commands" |\n',
     '| Coding agent | Which agent (Claude now, more later); what Claude may do without asking | "Edit files freely, ask before commands" |\n'
     '| Skills | Your own skills: how Claude does one kind of work ("Bug bash"), each a `SKILL.md` in `~/.devhub/plugin/skills`; you name one with / in the composer | None; four starters on offer |\n'),
]
for old, new in edits:
    if old not in s:
        raise SystemExit(f'Not found, so nothing was changed: {old[:60]}')
    s = s.replace(old, new)
open(p, 'w').write(s)
print('docs/product/spec.md updated for spec 023. Review it with: git diff docs/product/spec.md')
PY
