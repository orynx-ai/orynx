#!/bin/sh
# Spec 016 (F): the lines of docs/product/spec.md and docs/design/design-system.md that Slack and Discord change.
# Both are people-owned files, so a person runs this and commits it: `sh specs/016-slack-and-discord/people-files.sh`,
# from the repo's root.
set -eu
cd "$(dirname "$0")/../.."

python3 - <<'PY'
edits = {
    'docs/product/spec.md': [
        (
            '- Editing Jira tickets or writing Slack replies from inside DevHub (we link out instead).',
            '- Editing Jira tickets or writing Slack replies from inside DevHub (we link out instead), but for the one '
            "reply with a pull request's link that a session posts in its thread on your click (spec 016, Q2).",
        ),
        (
            '| Local first | Runs on your laptop; talks only to Jira, GitHub, Slack and Claude directly. |',
            '| Local first | Runs on your laptop; talks only to Jira, GitHub, Slack, Discord and Claude directly. |',
        ),
        (
            'The server talks to Jira, GitHub, Slack and Claude with your own logins; there is no DevHub cloud.',
            'The server talks to Jira, GitHub, Slack, Discord and Claude with your own logins; there is no DevHub cloud.',
        ),
        (
            '| Slack | Slack app with a user token (`search:read`, `channels:history`, `im:history`) | Mentions and DMs '
            'to you, and threads you add as context | Nothing in v1 (Reply opens Slack) | Needs Slack admin approval |',
            '| Slack | Slack app with a user token (eleven scopes, spec 016 A) | Mentions and DMs to you, and threads you '
            "add as context | One reply with a pull request's link, on your click | Needs Slack admin approval |\n"
            '| Discord | A bot you make, with Message Content Intent | Mentions of you in the servers the bot is in, and '
            "threads you add as context | One reply with a pull request's link, on your click | A bot can't read DMs |",
        ),
    ],
    'docs/design/design-system.md': [
        (
            '| `--source-slack-subtle` | `#f5edf7` | `#2b1d31` | Background behind the Slack mark. |',
            '| `--source-slack-subtle` | `#f5edf7` | `#2b1d31` | Background behind the Slack mark. |\n'
            "| `--source-discord` | `#4752c4` | `#a3abf5` | Discord's source, always shown with its name (spec 016, Q5). |\n"
            '| `--source-discord-subtle` | `#eef0fd` | `#1e2138` | Background behind the Discord mark. |\n'
            "| `--brand-discord` | `#5865f2` | same | Discord's logo. Logos only. |",
        ),
        (
            'DevHub talks only to Jira, GitHub, Slack and Claude.</span>',
            'DevHub talks only to Jira, GitHub, Slack, Discord and Claude.</span>',
        ),
    ],
}
for path, changes in edits.items():
    text = open(path).read()
    for old, new in changes:
        if old not in text:
            raise SystemExit(f'{path}: this line is no longer there, so nothing was changed: {old[:60]}')
        text = text.replace(old, new, 1)
    open(path, 'w').write(text)
print('Done. Review the diff, then commit.')
PY
