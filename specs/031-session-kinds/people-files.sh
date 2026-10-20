#!/bin/sh
# Spec 031: the people-owned file that goes with feat/031-session-kinds. Agents may not edit it, so a person runs this
# from the repo root, then reviews it with git diff and commits it on the branch:
#   sh specs/031-session-kinds/people-files.sh
set -e
cd "$(dirname "$0")/../.."

python3 - <<'PY'
path = 'docs/product/spec.md'
s = open(path).read()
old = (
    'A session is one piece of work Claude does for you: one task, one repo, one branch. It moves through five steps '
    '(Plan, Build, Test, Review, Pull request) and you can stop it at any time.'
)
new = (
    'A session is one piece of work Claude does for you. You pick **Ask** or **Build** in the composer (spec 031). An '
    'Ask answers and changes nothing: it reads a folder in place, or no folder at all, and has no steps. A Build is one '
    'task, one repo, one branch. It moves through five steps (Plan, Build, Test, Review, Pull request), and you can stop '
    'it at any time. A step Claude finished without, such as Test when it ran no command, shows as skipped. A Build on '
    'your own open pull request works on that pull request\'s branch, with no new branch, and its last step is Push.'
)
if new in s:
    raise SystemExit(f'{path} already says it, so nothing was changed.')
if s.count(old) != 1:
    raise SystemExit(f'{path}: expected the "Agent sessions" paragraph once, so nothing was changed.')
open(path, 'w').write(s.replace(old, new, 1))
PY

npx --no-install prettier --write docs/product/spec.md >/dev/null
echo 'Done. Check with: git status && git diff docs/product/spec.md'
