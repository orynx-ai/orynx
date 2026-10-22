import { describe, expect, it } from 'vitest';
import type { SessionActivity } from '@devhub/contracts';
import { makeSession } from '@devhub/contracts/testing';
import { problemWords, stepWords } from './step-words.ts';

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
const step = (activity: WithoutId<SessionActivity>) => stepWords({ id: 'step-1', ...activity });

describe('stepWords (Q10a)', () => {
  it('AC-28, AC-29 (spec 037, Q12i): what Claude did with an Orynx ticket', () => {
    const ticket = {
      kind: 'ticket' as const,
      state: 'done' as const,
      key: 'ORX-7',
      title: 'Flaky date test',
      fields: [],
      status: null,
    };
    expect(step({ ...ticket, action: 'listed', key: null, title: null })).toEqual({
      title: 'Read Orynx tickets',
      detail: null,
    });
    expect(step({ ...ticket, action: 'read' })).toEqual({ title: 'Read ORX-7', detail: 'Flaky date test' });
    expect(step({ ...ticket, action: 'created' })).toEqual({ title: 'Created ORX-7', detail: 'Flaky date test' });
    expect(step({ ...ticket, action: 'deleted' })).toEqual({ title: 'Deleted ORX-7', detail: 'Flaky date test' });
    expect(step({ ...ticket, action: 'updated', fields: ['status'], status: 'in_review' })).toEqual({
      title: 'Updated ORX-7',
      detail: 'Status: In review',
    });
    expect(step({ ...ticket, action: 'updated', fields: ['priority', 'dueDate', 'status'], status: 'done' })).toEqual({
      title: 'Updated ORX-7',
      detail: 'Status: Done · Changed the priority and due date',
    });
    expect(step({ ...ticket, action: 'updated' })).toEqual({ title: 'Updated ORX-7', detail: null });
  });

  it('AC-1, AC-2, Q4, Q10 (spec 044): what Claude did in Jira', () => {
    const jira = {
      kind: 'jira' as const,
      state: 'done' as const,
      key: 'MAG-12',
      summary: null,
      found: null,
      more: false,
      to: null,
    };
    expect(step({ ...jira, action: 'projects', key: null })).toEqual({ title: 'Read Jira projects', detail: null });
    const searched = { ...jira, action: 'searched' as const, key: null };
    expect(step({ ...searched, found: 12 })).toEqual({ title: 'Searched Jira', detail: '12 issues' });
    expect(step({ ...searched, found: 1 })).toEqual({ title: 'Searched Jira', detail: '1 issue' });
    expect(step({ ...searched, found: 0 })).toEqual({ title: 'Searched Jira', detail: 'No issues' });
    expect(step({ ...searched, found: 100, more: true })).toEqual({
      title: 'Searched Jira',
      detail: '100 issues, more in Jira',
    });
    expect(step({ ...jira, action: 'read', summary: 'Crash on save' })).toEqual({
      title: 'Read MAG-12',
      detail: 'Crash on save',
    });
    expect(step({ ...jira, action: 'commented' })).toEqual({ title: 'Commented on MAG-12', detail: null });
    expect(step({ ...jira, action: 'moved', to: 'In Review' })).toEqual({
      title: 'Moved MAG-12 to In Review',
      detail: null,
    });
    expect(step({ ...jira, action: 'assigned', to: 'me' })).toEqual({ title: 'Assigned MAG-12 to you', detail: null });
    expect(step({ ...jira, action: 'assigned', to: 'nobody' })).toEqual({ title: 'Unassigned MAG-12', detail: null });
  });

  it('AC-13, Q10 (spec 044): a Jira change waiting for you, and one you denied', () => {
    expect(
      step({ kind: 'waiting', state: 'running', approvalId: 'approval-1', about: 'jira', text: 'MAG-12' }),
    ).toEqual({ title: 'Waiting for your approval', detail: 'Wants to change MAG-12 in Jira' });
    expect(step({ kind: 'denied', state: 'done', about: 'jira', text: 'MAG-12' })).toEqual({
      title: 'You denied a Jira change',
      detail: 'MAG-12',
    });
    expect(step({ kind: 'denied', state: 'done', about: 'server', text: 'next dev' })).toEqual({
      title: 'You denied a server',
      detail: 'next dev',
    });
  });

  it('AC-2: the worktree, while git works and once made', () => {
    const worktree = { kind: 'worktree', branch: 'feat/PROJ-1423', base: 'origin/main', fetched: true } as const;
    expect(step({ ...worktree, state: 'running', fetched: false })).toEqual({
      title: 'Making a worktree',
      detail: 'feat/PROJ-1423 from origin/main',
    });
    expect(step({ ...worktree, state: 'done' })).toEqual({
      title: 'Made a worktree',
      detail: 'feat/PROJ-1423 from origin/main',
    });
  });

  it('AC-2 (Q1a): says the base was the last fetched one when origin couldn’t be reached', () => {
    expect(
      step({ kind: 'worktree', state: 'done', branch: 'feat/PROJ-1423', base: 'origin/main', fetched: false }).detail,
    ).toBe('feat/PROJ-1423 from origin/main (last fetched, offline)');
    // A local branch is never fetched, so it says nothing about it.
    expect(
      step({ kind: 'worktree', state: 'done', branch: 'feat/PROJ-1423', base: 'main', fetched: false }).detail,
    ).toBe('feat/PROJ-1423 from main');
  });

  it('AC-14, Q8f (spec 031): the worktree on your pull request’s branch names the pull request', () => {
    const number = 2836;
    const made = {
      kind: 'worktree',
      branch: 'fix/content-list',
      base: 'origin/fix/content-list',
      pullRequest: number,
    } as const;
    expect(step({ ...made, state: 'done', fetched: true })).toEqual({
      title: 'Made a worktree',
      detail: `fix/content-list from #${String(number)}`,
    });
    expect(step({ ...made, state: 'done', fetched: false }).detail).toBe(
      `fix/content-list from #${String(number)} (last fetched, offline)`,
    );
  });

  it('AC-15 (spec 031): discarding a session on your pull request’s branch keeps the branch', () => {
    expect(step({ kind: 'discarded', state: 'done', branch: 'fix/content-list', kept: true })).toEqual({
      title: 'Discarded the changes',
      detail: 'The worktree is deleted. fix/content-list stays as it is on GitHub.',
    });
  });

  it('AC-3: the brief', () => {
    expect(
      step({
        kind: 'brief',
        state: 'done',
        key: 'PROJ-1423',
        tickets: [],
        message: false,
        pullRequests: [],
        files: [],
        skills: [],
      }),
    ).toEqual({
      title: 'Sent Claude the brief',
      detail: 'PROJ-1423 and its description',
    });
  });

  it('015 AC-24: the brief names your message, the ticket, the pull requests and the files Claude got', () => {
    const brief = { kind: 'brief', state: 'done', tickets: [] as string[], skills: [] as string[] } as const;
    expect(step({ ...brief, key: null, message: true, pullRequests: [], files: [] }).detail).toBe('Your message');
    expect(step({ ...brief, key: 'PROJ-1423', message: true, pullRequests: [], files: [] }).detail).toBe(
      'Your message and PROJ-1423',
    );
    expect(
      step({ ...brief, key: null, message: true, pullRequests: ['web-app #2836', 'api #12'], files: ['notes.md'] })
        .detail,
    ).toBe('Your message, web-app #2836, api #12 and 1 more');
    expect(step({ ...brief, key: null, message: false, pullRequests: [], files: ['a.md', 'b.md'] }).detail).toBe(
      'a.md and b.md',
    );
  });

  it('022 AC-53: the brief names the skills your message asked for, last', () => {
    expect(
      step({
        kind: 'brief',
        state: 'done',
        key: null,
        tickets: [],
        message: true,
        pullRequests: [],
        files: [],
        skills: ['/review'],
      }).detail,
    ).toBe('Your message and /review');
  });

  it('022 AC-17: the brief names files you picked by their names, wherever they are', () => {
    expect(
      step({
        kind: 'brief',
        state: 'done',
        key: null,
        tickets: [],
        message: true,
        pullRequests: [],
        files: ['~/notes/plan.pdf', '/Users/dev/Movies/demo.mov'],
        skills: [],
      }).detail,
    ).toBe('Your message, plan.pdf and demo.mov');
  });

  it('022 AC-4: the brief names the other tickets after the session’s own', () => {
    expect(
      step({
        kind: 'brief',
        state: 'done',
        key: 'PROJ-1423',
        tickets: ['PROJ-1424'],
        message: true,
        pullRequests: [],
        files: [],
        skills: [],
      }).detail,
    ).toBe('Your message, PROJ-1423 and PROJ-1424');
    expect(
      step({
        kind: 'brief',
        state: 'done',
        key: 'PROJ-1423',
        tickets: ['PROJ-1424'],
        message: false,
        pullRequests: [],
        files: [],
        skills: [],
      }).detail,
    ).toBe('PROJ-1423 and PROJ-1424');
  });

  it('AC-4: explore, in the present tense while running, with the files’ own names', () => {
    const files = ['src/content/ContentList.tsx', 'src/api/contentApi.ts', 'src/hooks/useSelection.ts'];
    expect(step({ kind: 'explore', state: 'running', files })).toEqual({
      title: 'Exploring the code',
      detail: 'ContentList.tsx, contentApi.ts and useSelection.ts',
    });
    const nine = [...files, 'a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'];
    expect(step({ kind: 'explore', state: 'done', files: nine })).toEqual({
      title: 'Explored the code',
      detail: 'ContentList.tsx, contentApi.ts, useSelection.ts and 6 more',
    });
    expect(step({ kind: 'explore', state: 'done', files: [] }).detail).toBeNull();
  });

  it('AC-4: the plan, with its first items', () => {
    expect(step({ kind: 'plan', state: 'running', items: ['Row selection', 'A bulkArchive API call'] })).toEqual({
      title: 'Making a plan',
      detail: 'Row selection and A bulkArchive API call',
    });
    expect(step({ kind: 'plan', state: 'done', items: ['One', 'Two', 'Three', 'Four'] })).toEqual({
      title: 'Made a plan',
      detail: 'One, Two, Three and 1 more',
    });
  });

  it('AC-4: edits, counted', () => {
    expect(step({ kind: 'edit', state: 'running', files: ['src/a.ts'] })).toEqual({
      title: 'Editing files',
      detail: 'a.ts',
    });
    expect(step({ kind: 'edit', state: 'done', files: ['src/a.ts'] }).title).toBe('Edited 1 file');
    expect(step({ kind: 'edit', state: 'done', files: ['a.ts', 'b.ts', 'c.ts', 'd.ts'] })).toEqual({
      title: 'Edited 4 files',
      detail: 'a.ts, b.ts, c.ts and 1 more',
    });
  });

  it('AC-5, AC-6: a refused call, with its path', () => {
    expect(
      step({ kind: 'refused', state: 'done', access: 'edit', reason: 'outside_worktree', path: '/etc/hosts' }),
    ).toEqual({
      title: "Couldn't edit outside the worktree",
      detail: '/etc/hosts',
    });
    expect(
      step({ kind: 'refused', state: 'done', access: 'read', reason: 'outside_worktree', path: '/etc/hosts' }).title,
    ).toBe("Couldn't read outside the worktree");
    expect(
      step({ kind: 'refused', state: 'done', access: 'edit', reason: 'ask_everything', path: 'src/a.ts' }),
    ).toEqual({
      title: "Couldn't edit files: Ask before everything is on",
      detail: 'src/a.ts',
    });
  });

  it('spec 026: an edit or a command an Ask session refused, with its path or command', () => {
    expect(step({ kind: 'refused', state: 'done', access: 'edit', reason: 'ask_session', path: 'src/a.ts' })).toEqual({
      title: "Couldn't edit files: this is an Ask session",
      detail: 'src/a.ts',
    });
    expect(step({ kind: 'refused', state: 'done', access: 'run', reason: 'ask_session', path: 'ls' }).title).toBe(
      "Couldn't run a command: this is an Ask session",
    );
  });

  it('012 AC-7, Q8c: a push or a background command Orynx refused, with the command', () => {
    expect(
      step({ kind: 'refused', state: 'done', access: 'run', reason: 'push', path: 'git push origin main' }),
    ).toEqual({
      title: "Couldn't push or open a pull request: Settings didn't allow it",
      detail: 'git push origin main',
    });
    expect(step({ kind: 'refused', state: 'done', access: 'run', reason: 'background', path: 'npm start &' })).toEqual({
      title: "Couldn't run a command in the background",
      detail: 'npm start &',
    });
  });

  it('012 AC-1, AC-8, Q8c: a call waiting for your approval, with Claude’s line or the path', () => {
    expect(
      step({
        kind: 'waiting',
        state: 'running',
        approvalId: 'ap-1',
        about: 'command',
        text: 'Run the content list tests',
      }),
    ).toEqual({ title: 'Waiting for your approval', detail: 'Run the content list tests' });
    expect(step({ kind: 'waiting', state: 'running', approvalId: 'ap-1', about: 'command', text: null })).toEqual({
      title: 'Waiting for your approval',
      detail: 'Wants to run a command',
    });
    expect(step({ kind: 'waiting', state: 'running', approvalId: 'ap-2', about: 'edit', text: 'src/a.ts' })).toEqual({
      title: 'Waiting for your approval',
      detail: 'Wants to edit src/a.ts',
    });
  });

  it('012 AC-2, AC-10, Q8c: commands, while one runs and once they ran', () => {
    expect(step({ kind: 'command', state: 'running', commands: ['npm test'] })).toEqual({
      title: 'Running a command',
      detail: 'npm test',
    });
    expect(step({ kind: 'command', state: 'done', commands: ['npm test'] })).toEqual({
      title: 'Ran 1 command',
      detail: 'npm test',
    });
    expect(step({ kind: 'command', state: 'done', commands: ['npm test', 'npm run lint', 'pnpm build'] })).toEqual({
      title: 'Ran 3 commands',
      detail: 'npm test, npm run lint and pnpm build',
    });
  });

  it('012 AC-3, AC-8, Q8c: a call you denied, with the command or the path', () => {
    expect(step({ kind: 'denied', state: 'done', about: 'command', text: 'rm -rf dist' })).toEqual({
      title: 'You denied a command',
      detail: 'rm -rf dist',
    });
    expect(step({ kind: 'denied', state: 'done', about: 'edit', text: 'src/a.ts' })).toEqual({
      title: 'You denied an edit',
      detail: 'src/a.ts',
    });
  });

  it('012 AC-20, Q2b, Q8c: commands are off where the sandbox can’t run', () => {
    expect(step({ kind: 'no_commands', state: 'done', reason: 'no_sandbox' })).toEqual({
      title: "Commands are off: Claude Code's sandbox can't run on this computer",
      detail: null,
    });
  });

  it('AC-8, AC-9, AC-10, AC-14: how a session ended', () => {
    expect(step({ kind: 'finished', state: 'done', summary: 'Added a toolbar button.' })).toEqual({
      title: 'Finished',
      detail: 'Added a toolbar button.',
    });
    expect(step({ kind: 'stopped', state: 'done' })).toEqual({
      title: 'You stopped Claude',
      detail: 'The worktree keeps the changes.',
    });
    expect(step({ kind: 'interrupted', state: 'done' })).toEqual({
      title: 'Orynx closed while Claude was working',
      detail: 'The worktree keeps the changes.',
    });
    expect(step({ kind: 'discarded', state: 'done', branch: 'feat/PROJ-1423', kept: false })).toEqual({
      title: 'Discarded the changes',
      detail: 'The worktree and feat/PROJ-1423 are deleted.',
    });
  });
});

describe('problemWords (Q10f)', () => {
  const session = makeSession({ folder: { name: 'web-app', displayPath: '~/code/web-app' } });

  it("AC-13: says Claude couldn't start before it worked, and stopped with an error after", () => {
    expect(problemWords({ kind: 'login', stage: 'starting' }, session).title).toBe("Claude couldn't start");
    expect(problemWords({ kind: 'limit', stage: 'working' }, session).title).toBe('Claude stopped with an error');
  });

  it.each([
    ['jira', "Orynx couldn't read PROJ-1423 from Jira. Check Settings › Connections, then start again."],
    ['folder', "~/code/web-app isn't a git repository any more. Check Settings › Repositories."],
    ['git', "git couldn't make the worktree. See the terminal for details."],
    ['login', "Claude Code's login didn't work. Sign in with `claude` in a terminal, then start again."],
    ['limit', "Claude's service is busy or your usage limit is reached. Try again later."],
    ['other', 'See the terminal for details.'],
  ] as const)('AC-13: says what to do about %s', (kind, line) => {
    expect(problemWords({ kind, stage: 'starting' }, session).line).toBe(line);
  });

  it("013 AC-16, Q10d: says Claude couldn't carry on when Claude Code lost the conversation", () => {
    expect(problemWords({ kind: 'resume', stage: 'working' }, session)).toEqual({
      title: "Claude couldn't carry on",
      line: "Claude Code no longer has this session's conversation. Start again from the ticket.",
    });
  });
});

describe('your message (spec 013, Q10e)', () => {
  it('AC-11, AC-12: says you asked Claude, with your message', () => {
    expect(step({ kind: 'message', state: 'done', text: 'Use the existing useSelection hook instead' })).toEqual({
      title: 'You asked Claude',
      detail: 'Use the existing useSelection hook instead',
    });
  });

  it('AC-11: shows the first 3 lines of a longer message, then …', () => {
    const text = 'First line\nSecond line\nThird line\nFourth line';
    expect(step({ kind: 'message', state: 'done', text }).detail).toBe('First line\nSecond line\nThird line\n…');
    expect(step({ kind: 'message', state: 'done', text: 'One\nTwo\nThree' }).detail).toBe('One\nTwo\nThree');
  });
});

describe('the pull request (spec 014, Q11e)', () => {
  const number = 2841;
  const url = `https://github.com/acme/web-app/pull/${String(number)}`;
  const pr = `#${String(number)}`;

  it('AC-4: says Orynx opened the pull request, with what it committed and pushed', () => {
    const opened = {
      kind: 'pull_request',
      state: 'done',
      number,
      url,
      branch: 'feat/PROJ-1423',
      linked: false,
    } as const;
    expect(step({ ...opened, files: 4 })).toEqual({
      title: `Opened pull request ${pr}`,
      detail: 'Committed 4 files and pushed feat/PROJ-1423',
    });
    expect(step({ ...opened, files: 1 }).detail).toBe('Committed 1 file and pushed feat/PROJ-1423');
    // Claude had committed everything, so Orynx only pushed.
    expect(step({ ...opened, files: 0 }).detail).toBe('Pushed feat/PROJ-1423');
  });

  it('AC-11: says Orynx linked the pull request GitHub already had', () => {
    const linked = {
      kind: 'pull_request',
      state: 'done',
      number,
      url,
      branch: 'feat/PROJ-1423',
      linked: true,
    } as const;
    expect(step({ ...linked, files: 0 })).toEqual({
      title: `Linked pull request ${pr}`,
      detail: 'Pushed feat/PROJ-1423',
    });
  });

  it('AC-17: says Orynx pushed changes to the pull request, with the files it committed', () => {
    expect(step({ kind: 'pushed', state: 'done', number, url, files: 2 })).toEqual({
      title: `Pushed changes to ${pr}`,
      detail: 'Committed 2 files',
    });
    expect(step({ kind: 'pushed', state: 'done', number, url, files: 0 }).detail).toBeNull();
  });
});

describe('stepWords (spec 042)', () => {
  const reading = {
    kind: 'reading',
    state: 'done',
    intent: 'run',
    base: 'develop',
    missingBase: null,
    branch: null,
    branchFrom: null,
    suggested: null,
    branchNote: null,
  } as const;

  it('AC-1: the quick read, while it reads and once read', () => {
    expect(step({ ...reading, state: 'running', intent: null, base: null })).toEqual({
      title: 'Reading your ask…',
      detail: null,
    });
    expect(step(reading)).toEqual({ title: 'Run · from develop · no branch yet', detail: null });
    expect(step({ ...reading, intent: 'answer' }).title).toBe('Question · from develop · no branch yet');
  });

  it('AC-15, AC-21, AC-23: a change names its branch, where its shape came from, and what Orynx had to change', () => {
    const change = {
      ...reading,
      intent: 'change',
      branch: 'fix/login-redirect-loop',
      branchFrom: 'repo_rules',
    } as const;
    expect(step(change)).toEqual({
      title: 'Code change · from develop',
      detail: "Branch fix/login-redirect-loop at the first edit, as the repository's written rules say",
    });
    expect(
      step({ ...change, missingBase: 'release/26.10.03', suggested: 'fix login', branchNote: 'unusable' }).detail,
    ).toBe(
      "Branch fix/login-redirect-loop at the first edit, as the repository's written rules say · release/26.10.03 isn't on origin; started from develop · \"fix login\" couldn't be a branch name",
    );
    expect(step({ ...change, branchFrom: 'message', suggested: 'fix/x', branchNote: 'taken' }).detail).toBe(
      'Branch fix/login-redirect-loop at the first edit, as your message says · fix/x is taken',
    );
  });

  it('AC-22: a read that failed', () => {
    expect(step({ ...reading, intent: null, base: null })).toEqual({
      title: "Couldn't read your ask, so the usual steps are shown",
      detail: null,
    });
  });

  it('AC-1: a worktree with no branch yet', () => {
    expect(step({ kind: 'worktree', state: 'done', branch: null, base: 'origin/develop', fetched: true })).toEqual({
      title: 'Made a worktree',
      detail: 'from origin/develop',
    });
  });

  it('AC-24: changed steps, with the reason and both lists', () => {
    expect(
      step({
        kind: 'steps_changed',
        state: 'done',
        from: [{ kind: 'setup', label: 'Set up' }],
        to: [
          { kind: 'setup', label: 'Set up' },
          { kind: 'build', label: 'Fix env' },
        ],
        reason: 'The server fails on a missing env key.',
      }),
    ).toEqual({
      title: 'Steps changed',
      detail: 'The server fails on a missing env key.\nWas: Set up\nNow: Set up · Fix env',
    });
  });

  it('AC-15: a branch made at the first edit', () => {
    expect(step({ kind: 'branch_made', state: 'done', branch: 'fix/env-key', from: 'your_branches' })).toEqual({
      title: 'Made branch fix/env-key',
      detail: 'Like your recent branches',
    });
  });

  it('AC-2, AC-4: a server started, stopped, and one that ended on its own', () => {
    const server = { kind: 'server', state: 'done', port: 3005, command: 'next dev --port 3005' } as const;
    expect(step({ ...server, event: 'started' })).toEqual({
      title: 'Started a server on localhost:3005',
      detail: 'next dev --port 3005',
    });
    expect(step({ ...server, event: 'stopped' }).title).toBe('Stopped the server on localhost:3005');
    expect(step({ ...server, event: 'exited' }).title).toBe('The server on localhost:3005 ended');
    expect(step({ ...server, event: 'started', port: null }).title).toBe('Started a server; nothing listens yet');
    expect(step({ ...server, event: 'exited', port: null }).title).toBe('The server ended before it listened');
  });
});
