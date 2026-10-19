import { describe, expect, it } from 'vitest';
import {
  briefText,
  composerBrief,
  diffForBrief,
  sessionNote,
  ticketBrief,
  ticketFromBrief,
  type BriefPullRequest,
  type BriefTicket,
} from './brief.ts';

const issue = {
  key: 'PROJ-1423',
  summary: 'Add bulk archive to the content list',
  type: 'Story',
  description: 'Content managers need to archive many items at once.\n\n- Checkbox on each row',
};

describe('the brief', () => {
  it('AC-3 (Q5): is the ticket, exactly: its key, type and summary, a blank line, then the description', () => {
    expect(briefText(ticketBrief(issue))).toBe(
      'Jira ticket PROJ-1423 (Story): Add bulk archive to the content list\n\n' +
        'Content managers need to archive many items at once.\n\n- Checkbox on each row',
    );
  });

  it('AC-3 (Q5): says "No description." when the ticket has none', () => {
    expect(briefText(ticketBrief({ ...issue, description: null }))).toBe(
      'Jira ticket PROJ-1423 (Story): Add bulk archive to the content list\n\nNo description.',
    );
  });

  it('AC-3: leaves the type out when Jira gives none', () => {
    expect(briefText(ticketBrief({ ...issue, type: null, description: null }))).toBe(
      'Jira ticket PROJ-1423: Add bulk archive to the content list\n\nNo description.',
    );
  });

  it('AC-3: holds the ticket as its one context chip, and no message of yours', () => {
    expect(ticketBrief(issue)).toEqual({
      message: '',
      context: [
        {
          kind: 'jira',
          title: 'Jira ticket PROJ-1423 (Story): Add bulk archive to the content list',
          body: issue.description,
        },
      ],
    });
  });

  it('puts your message first when there is one, as the composer will (spec 015)', () => {
    expect(briefText({ ...ticketBrief(issue), message: 'Keep it small.' })).toMatch(
      /^Keep it small\.\n\nJira ticket PROJ-1423 \(Story\)/,
    );
  });
});

describe('the note added to Claude Code’s system prompt', () => {
  it('AC-3 (011 Q5, 012 Q8g, 013 Q2a): says where Claude works, what it may not do, and that commands may wait, word for word', () => {
    expect(sessionNote('feat/PROJ-1423', true)).toBe(
      "You're working in a separate git worktree on the branch feat/PROJ-1423. Make the change the ticket asks for. " +
        'If the repository has a CLAUDE.md, read it first. ' +
        "Don't push, open pull requests or change git settings. " +
        'You can run commands in the worktree. ' +
        "They run in a sandbox with no network, and some wait for the user's approval. " +
        "Run the project's tests and checks before you finish. " +
        "When you're done, summarise what you changed and which checks you ran, in a few sentences. " +
        'If you need a decision from the user, finish and ask it in your summary. The user answers in a follow-up.',
    );
  });

  it('spec 026: says Claude may push the branch or open its pull request only as Settings allows, and how', () => {
    const note = (push: 'never' | 'ask' | 'allow', pullRequest: 'never' | 'ask' | 'allow', commands = true) =>
      sessionNote('feat/PROJ-1423', commands, true, { push, pullRequest });
    expect(note('allow', 'ask')).toContain(
      'You may push this branch with exactly `git push origin feat/PROJ-1423` on its own. ' +
        'Never force-push or push another branch. ' +
        'You may open its pull request with `gh pr create`, once the user allows it. ' +
        "Don't change git settings.",
    );
    expect(note('ask', 'never')).toContain(
      'with exactly `git push origin feat/PROJ-1423` on its own, once the user allows it. Never force-push',
    );
    expect(note('ask', 'never')).toContain("Don't open pull requests.");
    expect(note('never', 'allow')).toContain("Don't push. You may open its pull request with `gh pr create`.");
    // Without commands there's no git to run, so the old line stays.
    expect(note('allow', 'allow', false)).toContain("Don't push, open pull requests or change git settings.");
  });

  it('012 AC-20: where commands can’t run, says so, and asks which ones Claude would run', () => {
    expect(sessionNote('feat/PROJ-1423', false)).toBe(
      "You're working in a separate git worktree on the branch feat/PROJ-1423. Make the change the ticket asks for. " +
        'If the repository has a CLAUDE.md, read it first. ' +
        "Don't push, open pull requests or change git settings. " +
        "You can't run commands on this computer, so say which ones you'd run to check your work. " +
        "When you're done, summarise what you changed in a few sentences. " +
        'If you need a decision from the user, finish and ask it in your summary. The user answers in a follow-up.',
    );
  });
});

describe('ticketFromBrief (spec 013)', () => {
  it('AC-9: reads the type and description back from a brief saved before spec 013 kept the ticket', () => {
    const issue = {
      key: 'PROJ-1423',
      summary: 'Add bulk archive',
      type: 'Story',
      description: 'Content managers…\n\n- one',
    };
    expect(ticketFromBrief(briefText(ticketBrief(issue)))).toEqual({
      type: 'Story',
      description: 'Content managers…\n\n- one',
    });
  });

  it('AC-9: reads no type and no description as none', () => {
    const issue = { key: 'PROJ-1423', summary: 'Fix (again): the toolbar', type: null, description: null };
    expect(ticketFromBrief(briefText(ticketBrief(issue)))).toEqual({ type: null, description: null });
  });

  it('reads nothing from a brief that isn’t a ticket’s', () => {
    expect(ticketFromBrief('Fix the toolbar')).toBeNull();
  });
});

describe("the composer's brief (spec 015)", () => {
  const ticket: BriefTicket = {
    ...issue,
    comments: [
      { author: 'Priya Shah', created: '2026-10-14T09:12:00.000+0100', body: 'Archive, not delete.' },
      { author: 'Sam Lee', created: '2026-10-15T16:40:00.000+0100', body: 'Keep the undo toast.' },
    ],
    links: [
      { relation: 'blocks', key: 'PROJ-1400', summary: 'Release 4.2', status: 'In progress' },
      { relation: 'is cloned by', key: 'PROJ-1500', summary: 'Bulk archive on mobile', status: null },
    ],
  };
  const pull: BriefPullRequest = {
    owner: 'acme',
    name: 'web-app',
    number: 2836,
    title: 'Lazy-load the people directory',
    body: 'Loads 50 people at a time.',
    base: 'main',
    head: 'feat/lazy-people',
    failingChecks: [{ name: 'test (ubuntu)', conclusion: 'failure' }],
    comments: [{ author: 'octocat', path: 'src/people.ts', line: 12, body: 'Name this constant.' }],
    diff: { kind: 'text', text: 'diff --git a/src/people.ts b/src/people.ts\n+const page = 50;' },
  };

  it('AC-4: is your message alone when there are no chips', () => {
    expect(briefText(composerBrief('Add a CSV export to the reports page', []))).toBe(
      'Add a CSV export to the reports page',
    );
  });

  it('AC-20 (Q3): gives the ticket with its description, comments and linked issues', () => {
    expect(briefText(composerBrief('', [{ kind: 'jira', ...ticket }]))).toBe(
      [
        'Jira ticket PROJ-1423 (Story): Add bulk archive to the content list',
        issue.description,
        '## Comments',
        'Priya Shah, 2026-10-14:\nArchive, not delete.',
        'Sam Lee, 2026-10-15:\nKeep the undo toast.',
        '## Linked issues',
        '- blocks PROJ-1400 (In progress): Release 4.2\n- is cloned by PROJ-1500: Bulk archive on mobile',
      ].join('\n\n'),
    );
  });

  it('AC-20: leaves out comments and links a ticket has none of', () => {
    expect(
      briefText(composerBrief('', [{ kind: 'jira', ...ticket, description: null, comments: [], links: [] }])),
    ).toBe('Jira ticket PROJ-1423 (Story): Add bulk archive to the content list\n\nNo description.');
  });

  it('AC-20 (Q4): gives the pull request with its branches, description, failing checks, open comments and diff', () => {
    expect(briefText(composerBrief('', [{ kind: 'pull_request', ...pull }]))).toBe(
      [
        'Pull request acme/web-app #2836: Lazy-load the people directory',
        'feat/lazy-people into main',
        'Loads 50 people at a time.',
        '## Failing checks',
        '- test (ubuntu): failure',
        '## Unresolved review comments',
        'octocat on src/people.ts line 12:\nName this constant.',
        '## Diff',
        '```diff\ndiff --git a/src/people.ts b/src/people.ts\n+const page = 50;\n```',
      ].join('\n\n'),
    );
  });

  it('AC-20 (Q4): says when GitHub found the diff too large, with the counts it has', () => {
    const large = composerBrief('', [
      {
        kind: 'pull_request',
        ...pull,
        body: null,
        failingChecks: [],
        comments: [{ author: 'octocat', path: 'README.md', line: null, body: 'Typo.' }],
        diff: { kind: 'too_large', files: [{ path: 'data/people.json', additions: 90_000, deletions: 12 }] },
      },
    ]);
    expect(briefText(large)).toBe(
      [
        'Pull request acme/web-app #2836: Lazy-load the people directory',
        'feat/lazy-people into main',
        'No description.',
        '## Unresolved review comments',
        'octocat on README.md:\nTypo.',
        '## Diff',
        'GitHub found the diff too large to send. The changed files:\n- data/people.json (+90000 −12)',
      ].join('\n\n'),
    );
  });

  it('022 AC-4 (Q4): gives each file by its path, for Claude to read where it is, in the order you added it', () => {
    const brief = composerBrief('Use the notes', [
      { kind: 'file', path: '~/notes/plan.pdf', real: '/Users/dev/notes/plan.pdf' },
      { kind: 'jira', ...ticket, comments: [], links: [] },
    ]);
    expect(brief.context.map((chip) => [chip.kind, chip.title])).toEqual([
      ['file', 'File ~/notes/plan.pdf'],
      ['jira', 'Jira ticket PROJ-1423 (Story): Add bulk archive to the content list'],
    ]);
    expect(briefText(brief)).toMatch(
      /^Use the notes\n\nFile ~\/notes\/plan\.pdf\n\nThe user added this file from their computer\. Read it at \/Users\/dev\/notes\/plan\.pdf\. It's outside your worktree: you can read it, not change it\.\n\nJira ticket/,
    );
  });
});

describe('a diff in the brief (spec 015, Q4)', () => {
  const file = (path: string, added: number, removed: number) =>
    [
      `diff --git a/${path} b/${path}`,
      `--- a/${path}`,
      `+++ b/${path}`,
      '@@ -1,1 +1,1 @@',
      ...Array.from({ length: added }, (_, n) => `+added ${String(n)}`),
      ...Array.from({ length: removed }, (_, n) => `-removed ${String(n)}`),
    ].join('\n');

  it('keeps a diff of 2,000 lines whole', () => {
    const text = file('a.ts', 1996, 0);
    expect(text.split('\n')).toHaveLength(2000);
    expect(diffForBrief(text)).toBe(`\`\`\`diff\n${text}\n\`\`\``);
  });

  it('cuts a longer one at 2,000 lines, then counts what follows by file', () => {
    const text = [file('a.ts', 1990, 0), file('b.ts', 30, 5), file('c.ts', 0, 2)].join('\n');
    const said = diffForBrief(text);
    expect(said.split('\n').slice(1, 2001)).toEqual(text.split('\n').slice(0, 2000));
    expect(said.split('\n\n').at(-1)).toBe(
      'The diff goes on for 39 more lines. Every changed file:\n- a.ts (+1990 −0)\n- b.ts (+30 −5)\n- c.ts (+0 −2)',
    );
  });
});

describe('the note without a ticket (spec 015, Q8c)', () => {
  it('asks Claude to do what the brief asks, and says the rest as before', () => {
    const note = sessionNote('feat/add-a-csv-export-to', false, false);
    expect(note).toMatch(
      /^You're working in a separate git worktree on the branch feat\/add-a-csv-export-to\. Do what the user asks in the brief\. If the repository/,
    );
    expect(note).not.toContain('ticket');
    expect(sessionNote('feat/PROJ-1423', false, true)).toContain('Make the change the ticket asks for.');
  });
});
