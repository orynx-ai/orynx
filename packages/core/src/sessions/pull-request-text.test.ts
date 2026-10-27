import { describe, expect, it } from 'vitest';
import type { FileDiff } from '@devhub/contracts';
import { makeChangedFile, makeFileDiff } from '@devhub/contracts/testing';
import {
  coAuthorLine,
  commitMessage,
  type DraftInputs,
  draftInstructions,
  draftInstructionsFor,
  draftPrompt,
  fallbackDraft,
  pushInstructions,
  pushPrompt,
  readCommitMessage,
  readDraft,
  readReplies,
} from './pull-request-text.ts';

const jiraUrl = 'https://your-team.atlassian.net/browse/PROJ-1423';
const ticket = { key: 'PROJ-1423', title: 'Add bulk archive to the content list', jiraUrl };

function inputs(overrides: Partial<DraftInputs> = {}): DraftInputs {
  return {
    ticket,
    brief:
      'Jira ticket PROJ-1423 (Story): Add bulk archive to the content list\n\nContent managers need to archive many items.',
    summaries: ['Added a checkbox to each row and Archive selected. `npm test -- content-list` passes.'],
    commits: ['Add selection state to the content list'],
    files: [makeChangedFile(), makeChangedFile({ path: 'src/content/api/contentApi.ts', added: 31, removed: 2 })],
    moreFiles: 0,
    diffs: [makeFileDiff()],
    template: null,
    baseSubjects: ['feat(content): show drafts first (#2790)', 'fix(api): retry archive on 502 (#2788)'],
    base: 'main',
    ...overrides,
  };
}

/** A diff of `count` added lines. */
function longDiff(path: string, count: number): FileDiff {
  return {
    path,
    lines: Array.from({ length: count }, (_, index) => ({
      kind: 'added',
      number: index + 1,
      text: `${path} line ${String(index + 1)}`,
    })),
    binary: false,
    renamedFrom: null,
    cut: false,
  };
}

describe('draftPrompt (spec 014, Q4)', () => {
  it('AC-15: holds exactly what Q4 lists: the ticket as sent, the summaries, commits, files, diff and base subjects', () => {
    const prompt = draftPrompt(inputs());
    expect(prompt).toContain('Content managers need to archive many items.');
    expect(prompt).toContain('Added a checkbox to each row and Archive selected.');
    expect(prompt).toContain('- Add selection state to the content list');
    expect(prompt).toContain('- src/content/ContentList.tsx +68 −9');
    expect(prompt).toContain('- src/content/api/contentApi.ts +31 −2');
    expect(prompt).toContain('+  const archive = useBulkArchive();');
    expect(prompt).toContain('-  const [rows] = useState(items);');
    expect(prompt).toContain('@@ -40,6 +40,8 @@');
    expect(prompt).toContain('- feat(content): show drafts first (#2790)');
    expect(prompt).not.toContain('template');
  });

  it('AC-3: holds the pull request template when the repository has one', () => {
    const prompt = draftPrompt(inputs({ template: '## Summary\n\n## Testing\n' }));
    expect(prompt).toContain("The repository's pull request template");
    expect(prompt).toContain('## Summary\n\n## Testing');
  });

  it('cuts the template at 10,000 characters', () => {
    const prompt = draftPrompt(inputs({ template: `${'x'.repeat(10_000)}TAIL` }));
    expect(prompt).toContain('x'.repeat(10_000));
    expect(prompt).not.toContain('TAIL');
  });

  it('Q4: sends the first 2,000 lines of the diff, then only the counts of what is left', () => {
    const diffs = [longDiff('src/a.ts', 1_500), longDiff('src/b.ts', 1_500)];
    const prompt = draftPrompt(inputs({ diffs }));
    expect(prompt).toContain('+src/a.ts line 1500');
    expect(prompt).toContain('+src/b.ts line 500');
    expect(prompt).not.toContain('+src/b.ts line 501');
    expect(prompt).toContain('The rest of the diff is left out; the list of changed files above has its counts.');
  });

  it('says a binary file and a rename without their bytes, and the files past the list', () => {
    const diffs = [
      { path: 'public/logo.png', lines: [], binary: true, renamedFrom: null, cut: false },
      { ...makeFileDiff(), path: 'src/content/List.tsx', renamedFrom: 'src/content/OldList.tsx' },
    ];
    const prompt = draftPrompt(inputs({ diffs, moreFiles: 41 }));
    expect(prompt).toContain('public/logo.png: a binary file');
    expect(prompt).toContain('src/content/List.tsx (renamed from src/content/OldList.tsx)');
    expect(prompt).toContain('…and 41 more files');
  });

  it('gives Claude its instructions: the shape of the answer, the style, and no invented facts or Jira link', () => {
    expect(draftInstructions).toContain('the title on the first line, then a blank line, then the description');
    expect(draftInstructions).toContain("Don't add a Jira link");
  });
});

describe('readDraft (spec 014, Q5)', () => {
  it.each([
    [
      'a title, a blank line, a description',
      'Add bulk archive (PROJ-1423)\n\n## What changed\n\nA lot.',
      'Add bulk archive (PROJ-1423)',
      '## What changed\n\nA lot.',
    ],
    ['a Markdown heading', '# PROJ-1423: Add bulk archive\n\nA lot.', 'PROJ-1423: Add bulk archive', 'A lot.'],
    ['a title in quotes', '"PROJ-1423: Add bulk archive"\n\nA lot.', 'PROJ-1423: Add bulk archive', 'A lot.'],
    [
      'a title in backticks and bold',
      '**`PROJ-1423: Add bulk archive`**\nA lot.',
      'PROJ-1423: Add bulk archive',
      'A lot.',
    ],
    ['blank lines first', '\n\n  PROJ-1423: Add bulk archive  \n\n\nA lot.\n', 'PROJ-1423: Add bulk archive', 'A lot.'],
  ])('AC-3: reads %s', (_shape, answer, title, body) => {
    expect(readDraft(answer, ticket)).toEqual({ title, body: `${body}\n\nJira: [PROJ-1423](${jiraUrl})` });
  });

  it('AC-3: puts the key in front of a title that lacks it', () => {
    expect(readDraft('Add bulk archive\n\nA lot.', ticket)?.title).toBe('PROJ-1423: Add bulk archive');
    expect(readDraft('feat(content): add bulk archive (proj-1423)\n\nA lot.', ticket)?.title).toBe(
      'feat(content): add bulk archive (proj-1423)',
    );
  });

  it('AC-3: adds the Jira line only when the description doesn’t link the ticket already', () => {
    const linked = `A lot.\n\nTicket: ${jiraUrl}`;
    expect(readDraft(`PROJ-1423: Add bulk archive\n\n${linked}`, ticket)?.body).toBe(linked);
    expect(readDraft('PROJ-1423: Add bulk archive\n\nA lot.', { ...ticket, jiraUrl: null })?.body).toBe('A lot.');
  });

  it('Q5: keeps the title to 256 characters and the description to 65,536', () => {
    const draft = readDraft(`${'t'.repeat(300)}\n\n${'b'.repeat(70_000)}`, ticket);
    expect(draft?.title).toHaveLength(256);
    expect(draft?.title.startsWith('PROJ-1423: ttt')).toBe(true);
    expect(draft?.body).toHaveLength(65_536);
    expect(draft?.body.endsWith(`Jira: [PROJ-1423](${jiraUrl})`)).toBe(true);
  });

  it('AC-6: reads nothing from an empty answer', () => {
    expect(readDraft('', ticket)).toBeNull();
    expect(readDraft('  \n# \n', ticket)).toBeNull();
  });
});

describe('fallbackDraft (spec 014, AC-6)', () => {
  it("AC-6: starts from the ticket's title and Claude's last summary", () => {
    expect(fallbackDraft(ticket, ['First run.', 'Switched to useSelection.'])).toEqual({
      title: 'PROJ-1423: Add bulk archive to the content list',
      body: `Switched to useSelection.\n\nJira: [PROJ-1423](${jiraUrl})`,
    });
  });

  it('AC-6: without a summary, holds only the Jira line, or nothing without a link', () => {
    expect(fallbackDraft(ticket, []).body).toBe(`Jira: [PROJ-1423](${jiraUrl})`);
    expect(fallbackDraft({ ...ticket, jiraUrl: null }, ['  ']).body).toBe('');
  });
});

describe('commit messages (spec 014, Q5, Q7)', () => {
  it('AC-5: ends with the Co-Authored-By line, after a blank line', () => {
    expect(coAuthorLine).toBe('Co-Authored-By: Claude <noreply@anthropic.com>');
    expect(commitMessage('PROJ-1423: Add bulk archive')).toBe(
      'PROJ-1423: Add bulk archive\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
    );
  });

  it('AC-17: asks Claude for one line about what is new since the last push', () => {
    const prompt = pushPrompt({
      ticket,
      summaries: ['Switched to useSelection.'],
      files: [makeChangedFile({ path: 'src/content/ContentList.tsx', added: 4, removed: 12 })],
      moreFiles: 0,
      diffs: [makeFileDiff()],
    });
    expect(prompt).toContain('Switched to useSelection.');
    expect(prompt).toContain('- src/content/ContentList.tsx +4 −12');
    expect(pushInstructions).toContain('one line');
  });

  it.each([
    ['a line', 'Use the existing useSelection hook', 'Use the existing useSelection hook'],
    ['quotes and more lines', '"Use the existing hook"\n\nBecause the reviewer asked.', 'Use the existing hook'],
    ['a heading', '## Use the existing hook', 'Use the existing hook'],
  ])('AC-17: reads %s as the commit message', (_shape, answer, message) => {
    expect(readCommitMessage(answer)).toBe(message);
  });

  it('AC-17: reads nothing from an empty answer, and keeps a message to 256 characters', () => {
    expect(readCommitMessage(' \n ')).toBeNull();
    expect(readCommitMessage('m'.repeat(300))).toHaveLength(256);
  });
});

describe('a pull request for a session with no ticket (spec 015, AC-34)', () => {
  const task = { key: null, title: 'Add a CSV export to the reports page', jiraUrl: null };

  it('tells Claude about the task, not a ticket, and asks for no key', () => {
    const prompt = draftPrompt(inputs({ ticket: task, brief: 'Add a CSV export to the reports page' }));
    expect(prompt.startsWith('The task, as Claude got it\n\nAdd a CSV export to the reports page')).toBe(true);
    expect(prompt).not.toContain('The ticket');
    expect(draftInstructionsFor(task)).not.toContain('key');
    expect(draftInstructionsFor(ticket)).toBe(draftInstructions);
    expect(draftPrompt(inputs({ ticket: task, brief: null }))).toContain(
      'The task, as Claude got it\n\nAdd a CSV export to the reports page',
    );
  });

  it('keeps the drafted title as it is, with no Jira line', () => {
    expect(readDraft('Add a CSV export\n\nAdds an Export button.', task)).toEqual({
      title: 'Add a CSV export',
      body: 'Adds an Export button.',
    });
  });

  it("starts from the session's title and Claude's last summary when Claude can't draft", () => {
    expect(fallbackDraft(task, ['Added the export.'])).toEqual({
      title: 'Add a CSV export to the reports page',
      body: 'Added the export.',
    });
  });

  it('names the task, not a ticket, when Claude writes a Push changes message', () => {
    const prompt = pushPrompt({ ticket: task, summaries: ['Fixed the header.'], files: [], moreFiles: 0, diffs: [] });
    expect(prompt.startsWith('The task\n\nAdd a CSV export to the reports page')).toBe(true);
  });
});

describe('Claude’s replies to review threads (spec 049)', () => {
  it('AC-2: reads the JSON, even fenced, for the threads asked about only, trimmed', () => {
    const answer = [
      'Here you go:',
      '```json',
      JSON.stringify({
        replies: [
          { thread: 'PRRT_a', reply: '  Done: it uses useSelection now. ' },
          { thread: 'PRRT_zz', reply: 'Not a thread.' },
          { thread: 'PRRT_c', reply: '   ' },
        ],
      }),
      '```',
    ].join('\n');
    expect(readReplies(answer, ['PRRT_a', 'PRRT_c'])).toEqual(new Map([['PRRT_a', 'Done: it uses useSelection now.']]));
  });

  it('AC-4: answers null for anything that isn’t that JSON', () => {
    for (const answer of ['Sure, I fixed them all!', '{"replies": "all of them"}', '{ not json }', '}{']) {
      expect(readReplies(answer, ['PRRT_a'])).toBeNull();
    }
  });
});
