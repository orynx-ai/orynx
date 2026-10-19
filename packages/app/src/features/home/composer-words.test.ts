import { describe, expect, it } from 'vitest';
import type { SessionApproval } from '@devhub/contracts';
import { makeSessionApproval } from '@devhub/contracts/testing';
import {
  addRow,
  bannerDetail,
  cannotStartLine,
  chipLabel,
  composerWords,
  contextFailedLine,
  countOf,
  fileRefusedLine,
  placeholderFor,
  refusedLine,
  removedLine,
  shortFileName,
} from './composer-words.ts';

describe('the composer’s words (spec 015, Q13)', () => {
  it('AC-3, AC-8: the placeholder asks for a task, or what to do with the ticket added', () => {
    expect(placeholderFor([])).toBe('Describe a task, or paste a Jira key like PROJ-1423');
    expect(placeholderFor(['PROJ-1423'])).toBe('What should Claude do with PROJ-1423?');
    // 022 Q12: several tickets.
    expect(placeholderFor(['PROJ-1423', 'PROJ-1424', 'MOB-7'])).toBe('What should Claude do with these 3 tickets?');
    expect(composerWords.send).toBe('Send to Claude');
    expect(composerWords.sending).toBe('Sending to Claude');
  });

  it('AC-6, AC-7: names each kind, what it searches by and what Claude gets from it', () => {
    expect(composerWords.kinds.heading).toBe('Add context for Claude');
    expect(composerWords.kinds.foot).toBe('Tip: you can also paste a Jira key or a pull request link into the box.');
    expect(composerWords.kinds.jira).toEqual({
      title: 'Jira ticket',
      description: 'Search by key or title',
      search: 'Search tickets by key or title',
      note: 'Claude gets the summary, description, comments and linked issues.',
      empty: 'No open tickets assigned to you. Type a key to add one.',
      notConnected: 'Connect Jira in Settings to add tickets.',
    });
    expect(composerWords.kinds.pullRequest.note).toBe(
      'Claude gets the description, the diff, failing checks and open review comments.',
    );
    expect(composerWords.kinds.repository.note).toBe('Claude works on a new branch in a worktree of this folder.');
    expect(composerWords.kinds.file).toEqual({
      title: 'File from this computer',
      description: 'Any file. Claude reads it where it is.',
    });
  });

  it('AC-7, AC-10: counts what a list holds, and offers a key or link it doesn’t hold', () => {
    expect(countOf('jira', 9)).toBe('9 open');
    expect(countOf('pull_request', 1)).toBe('1 open');
    expect(countOf('repository', 1)).toBe('1 folder');
    expect(countOf('repository', 2)).toBe('2 folders');
    expect(addRow('PROJ-9999')).toBe('Add PROJ-9999');
    expect(composerWords.noMatches).toBe('No matches. Try a key like PROJ-1423 or a repo name.');
  });

  it('AC-8, AC-11, AC-15: names a chip, and says it went', () => {
    expect(chipLabel({ kind: 'jira', key: 'PROJ-1423' })).toBe('PROJ-1423');
    expect(chipLabel({ kind: 'pull_request', owner: 'acme', name: 'web-app', number: 2836 })).toBe('web-app #2836');
    expect(chipLabel({ kind: 'file', path: '~/notes/notes.md' })).toBe('notes.md');
    expect(composerWords.remove('PROJ-1423')).toBe('Remove PROJ-1423');
    expect(removedLine('notes.md')).toBe('notes.md removed');
  });

  it('Q15d: cuts a long file name in the middle, so its extension shows', () => {
    expect(shortFileName('notes.md')).toBe('notes.md');
    expect(shortFileName('release-notes-for-the-people-directory.md')).toBe('release-notes-f…directory.md');
    expect(shortFileName('a-very-long-log-file-from-the-nightly-build.log')).toBe('a-very-long-log…ly-build.log');
    expect(shortFileName('x'.repeat(40))).toHaveLength(28);
    expect(chipLabel({ kind: 'file', path: '/Users/dev/release-notes-for-the-people-directory.md' })).toHaveLength(28);
  });

  it('AC-12, 022 AC-3: says why a file, a ticket or a pull request wasn’t added', () => {
    expect(fileRefusedLine({ kind: 'secret', name: 'id_rsa' })).toBe(
      "id_rsa looks like a secret, so Claude doesn't get it.",
    );
    expect(fileRefusedLine({ kind: 'too_many' })).toBe('Add up to 100 files.');
    expect(refusedLine('too_many_tickets')).toBe('A session takes up to 100 tickets.');
    expect(refusedLine('too_many_pull_requests')).toBe('A session takes up to 100 pull requests.');
    expect(refusedLine('too_many_files')).toBe('Add up to 100 files.');
  });

  it('AC-18, AC-22, AC-23: says why Send started nothing, and where to fix it', () => {
    expect(cannotStartLine('signed_out')).toEqual({
      line: "Claude Code isn't signed in.",
      link: { label: 'Open Settings › Coding agent', tab: 'coding-agent' },
    });
    expect(cannotStartLine('too_many')).toEqual({
      line: 'Three sessions are already working. Stop one to start another.',
      link: null,
    });
    expect(cannotStartLine('no_folder')).toEqual({
      line: 'Add a folder for Claude to work in.',
      link: { label: 'Open Settings › Repositories', tab: 'repositories' },
    });
    expect(cannotStartLine('choose_folder')).toEqual({ line: 'Choose a folder for Claude to work in.', link: null });
    expect(composerWords.existing('PROJ-1423')).toBe('PROJ-1423 already has a session.');
    expect(composerWords.failed).toBe("Couldn't start Claude. Try again.");
    expect(composerWords.tooLong).toBe('Keep it under 10,000 characters.');
  });

  it.each([
    [{ kind: 'jira', key: 'PROJ-9999' }, 'not_found', "Jira can't find PROJ-9999, or you can't see it.", null],
    [
      { kind: 'pull_request', owner: 'acme', name: 'web-app', number: 2836 },
      'not_found',
      "GitHub can't find acme/web-app #2836, or you can't see it.",
      null,
    ],
    [{ kind: 'jira', key: 'PROJ-1423' }, 'unreachable', "Jira didn't answer. Try again.", null],
    [
      { kind: 'pull_request', owner: 'acme', name: 'web-app', number: 2836 },
      'unreachable',
      "GitHub didn't answer. Try again.",
      null,
    ],
    [{ kind: 'jira', key: 'PROJ-1423' }, 'not_connected', 'Connect Jira in Settings to add tickets.', 'connections'],
    [
      { kind: 'pull_request', owner: 'acme', name: 'web-app', number: 2836 },
      'not_connected',
      'Connect GitHub in Settings to add pull requests.',
      'connections',
    ],
    [{ kind: 'jira', key: 'PROJ-1423' }, 'other', "Jira couldn't give PROJ-1423. Try again.", null],
    [{ kind: 'file', path: '~/notes/plan.pdf' }, 'not_found', "Orynx can't find ~/notes/plan.pdf.", null],
    [
      { kind: 'pull_request', owner: 'acme', name: 'web-app', number: 2836 },
      'other',
      "GitHub couldn't give acme/web-app #2836. Try again.",
      null,
    ],
  ] as const)('AC-21: %j %s reads %j', (chip, problem, line, tab) => {
    const said = contextFailedLine(chip, problem);
    expect(said.line).toBe(line);
    expect(said.link?.tab ?? null).toBe(tab);
  });

  it('AC-25, AC-26: the banner names the ticket, the title and what Claude wants, then how many more wait', () => {
    const command: SessionApproval = makeSessionApproval({ command: 'npm test' });
    expect(composerWords.banner.title).toBe('Claude is waiting for your approval');
    expect(bannerDetail({ key: 'PROJ-1423', title: 'Add bulk archive', approval: command, more: 0 })).toBe(
      'PROJ-1423 · Add bulk archive · wants to run npm test',
    );
    const edit: SessionApproval = {
      id: 'a1',
      askedAt: '2026-10-18T09:00:00.000Z',
      kind: 'edit',
      path: 'src/content/ContentList.tsx',
      creates: false,
      lines: [],
      moreLines: 0,
    };
    expect(bannerDetail({ key: null, title: 'Add a CSV export', approval: edit, more: 2 })).toBe(
      'Add a CSV export · wants to edit src/content/ContentList.tsx · 2 more waiting',
    );
    expect(bannerDetail({ key: 'PROJ-1', title: 'Fix it', approval: null, more: 1 })).toBe(
      'PROJ-1 · Fix it · 1 more waiting',
    );
  });
});
