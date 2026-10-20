#!/bin/sh
# Spec 037 (Q1, Q13): the lines of docs/product/spec.md that Orynx's own tickets change. spec.md is a people-owned
# file, so a person runs this and commits it: `sh specs/037-orynx-tickets/people-files.sh`, from the repo's root.
set -eu
cd "$(dirname "$0")/../.."

python3 - <<'PY'
path = 'docs/product/spec.md'
text = open(path).read()
changes = [
    (
        'Tickets shows your current Jira sprint as a board or a list, and is the main place to start Claude on a ticket.',
        "Tickets shows your current Jira sprint, with Orynx's own tickets beside it (spec 037), as a board or a list, "
        'and is the main place to start Claude on a ticket.',
    ),
    (
        '| Column + | Opens a small "New ticket" form (title, type, priority) that creates the issue in Jira in that status |',
        "| Column + | Opens the New ticket form, which makes one of Orynx's own tickets in that column (spec 037); "
        'creating an issue in Jira stays with spec 019 |',
    ),
    (
        '| Cached tickets, PRs, messages | `~/.devhub/cache.db` (SQLite) | Refreshed every 2 min; "Clear cache" in Settings; '
        'holds titles and metadata, not full Slack history |',
        '| Cached tickets, PRs, messages | `~/.devhub/cache.db` (SQLite) | Refreshed every 2 min; "Clear cache" in Settings; '
        'holds titles and metadata, not full Slack history |\n'
        "| Orynx's own tickets | `~/.devhub/tickets.json` | Yours, on this laptop alone (spec 037); Clear cache never "
        'touches them; agents outside Orynx reach them only through the MCP server you turn on in Settings › Coding agent |',
    ),
]
for old, new in changes:
    if new in text:
        continue
    if old not in text:
        raise SystemExit(f'{path} no longer holds: {old[:60]}…')
    text = text.replace(old, new, 1)
open(path, 'w').write(text)
print(f'Updated {path}. Check it, then commit it, for example:')
print('  git add docs/product/spec.md && git commit -m "docs(product): add Orynx\'s own tickets to the product spec"')
PY
