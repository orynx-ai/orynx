import { describe, expect, it } from 'vitest';
import { createCodexReader, type SeenCommand } from './items.ts';

const worktree = '/Users/you/.devhub/worktrees/0123456789abcdef';

function reader(seen: Record<string, SeenCommand> = {}) {
  return createCodexReader({ worktree, seen: (id) => seen[id] ?? null });
}

const command = (fields: Record<string, unknown> = {}) => ({
  type: 'commandExecution',
  id: 'item-1',
  command: 'npm test',
  cwd: worktree,
  status: 'inProgress',
  commandActions: [{ type: 'unknown', command: 'npm test' }],
  aggregatedOutput: null,
  exitCode: null,
  durationMs: null,
  ...fields,
});
const started = (item: unknown) => ['item/started', { item, threadId: 'thread-1', turnId: 'turn-1' }] as const;
const completed = (item: unknown) => ['item/completed', { item, threadId: 'thread-1', turnId: 'turn-1' }] as const;

describe("Codex's items as steps (spec 052)", () => {
  it('AC-7: a command Orynx allowed ends with its output, whether it failed, and how long it ran', () => {
    const read = reader({ 'item-1': 'command' });
    // Orynx said the command's step when it allowed it, so its start says nothing more.
    expect(read(...started(command()))).toEqual([]);
    expect(
      read(...completed(command({ status: 'failed', aggregatedOutput: '1 failing', exitCode: 1, durationMs: 840 }))),
    ).toEqual([
      { type: 'command_ended', id: 'item-1', output: '1 failing', failed: true, ms: 840 },
      { type: 'files_changed' },
    ]);
  });

  it('AC-7: a command Orynx never saw, as one your own Codex rules let run, still shows as a step', () => {
    const read = reader();
    expect(read(...started(command()))).toEqual([
      { type: 'work', work: { kind: 'command', id: 'item-1', command: 'npm test' } },
    ]);
    expect(
      read(...completed(command({ status: 'completed', aggregatedOutput: 'ok', exitCode: 0, durationMs: 5 }))),
    ).toEqual([{ type: 'command_ended', id: 'item-1', output: 'ok', failed: false, ms: 5 }, { type: 'files_changed' }]);
  });

  it('a command you denied never ran, so it never ends', () => {
    const read = reader({ 'item-1': 'command' });
    expect(read(...completed(command({ status: 'declined' })))).toEqual([]);
  });

  it("AC-7: a plain read shows as Claude's reads and searches do, with the file inside the worktree", () => {
    const read = reader({ 'item-2': 'read' });
    const item = command({
      id: 'item-2',
      command: 'cat src/a.ts && rg TODO',
      commandActions: [
        { type: 'read', command: 'cat src/a.ts', name: 'a.ts', path: `${worktree}/src/a.ts` },
        { type: 'search', command: 'rg TODO', query: 'TODO', path: null },
        { type: 'listFiles', command: 'ls', path: 'src' },
      ],
    });
    expect(read(...started(item))).toEqual([]);
    expect(read(...completed({ ...item, status: 'completed', exitCode: 0 }))).toEqual([
      { type: 'work', work: { kind: 'explore', file: 'src/a.ts' } },
      { type: 'work', work: { kind: 'explore', file: null } },
      { type: 'work', work: { kind: 'explore', file: null } },
    ]);
  });

  it('AC-7: an edit that went in is a step for each file, and the files changed', () => {
    const read = reader();
    const edit = {
      type: 'fileChange',
      id: 'item-3',
      changes: [
        { path: `${worktree}/src/a.ts`, kind: { type: 'update', movePath: null }, diff: '@@ -1 +1 @@\n-a\n+b\n' },
        { path: 'src/old.ts', kind: { type: 'update', movePath: `${worktree}/src/new.ts` }, diff: '' },
        { path: 'src/c.ts', kind: { type: 'add' }, diff: '+c\n' },
      ],
      status: 'inProgress',
    };
    expect(read(...started(edit))).toEqual([]);
    expect(read(...completed({ ...edit, status: 'completed' }))).toEqual([
      { type: 'work', work: { kind: 'edit', file: 'src/a.ts' } },
      { type: 'work', work: { kind: 'edit', file: 'src/new.ts' } },
      { type: 'work', work: { kind: 'edit', file: 'src/c.ts' } },
      { type: 'files_changed' },
    ]);
    expect(read(...completed({ ...edit, status: 'declined' }))).toEqual([]);
  });

  it("AC-7: Codex's plan is the session's plan, with each step's status", () => {
    const read = reader();
    expect(
      read('turn/plan/updated', {
        threadId: 'thread-1',
        turnId: 'turn-1',
        explanation: null,
        plan: [
          { step: 'Read the list', status: 'completed' },
          { step: 'Add the button', status: 'inProgress' },
          { step: 'Run the tests', status: 'pending' },
        ],
      }),
    ).toEqual([
      {
        type: 'work',
        work: {
          kind: 'plan',
          items: ['Read the list', 'Add the button', 'Run the tests'],
          statuses: ['completed', 'in_progress', 'pending'],
        },
      },
    ]);
  });

  it("AC-7: a turn that ends well ends with Codex's last message as its summary", () => {
    const read = reader();
    read(...completed({ type: 'agentMessage', id: 'm-1', text: 'Looking at the list first.' }));
    read(...completed({ type: 'reasoning', id: 'r-1', summary: ['hidden'], content: [] }));
    read(...completed({ type: 'agentMessage', id: 'm-2', text: 'Added the button and its test.' }));
    expect(
      read('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed', items: [] } }),
    ).toEqual([{ type: 'turn_ended', status: 'completed', summary: 'Added the button and its test.', problem: null }]);
    // The next turn starts with no summary of its own.
    expect(
      read('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-2', status: 'interrupted', items: [] } }),
    ).toEqual([{ type: 'turn_ended', status: 'interrupted', summary: '', problem: null }]);
  });

  it("AC-21: a failed turn says the login problem, the limit problem, or another, by Codex's error code alone", () => {
    const read = reader();
    const failed = (codexErrorInfo: unknown) =>
      read('turn/completed', {
        threadId: 'thread-1',
        turn: {
          id: 'turn-1',
          status: 'failed',
          items: [],
          error: { message: 'Your token for you@company.com expired', codexErrorInfo },
        },
      });
    expect(failed('unauthorized')).toEqual([
      { type: 'turn_ended', status: 'failed', summary: '', problem: { kind: 'login', code: 'unauthorized' } },
    ]);
    expect(failed('usageLimitExceeded')[0]).toMatchObject({ problem: { kind: 'limit', code: 'usageLimitExceeded' } });
    expect(failed('rateLimitExceeded')[0]).toMatchObject({ problem: { kind: 'limit' } });
    expect(failed({ httpConnectionFailed: { httpStatusCode: 502 } })[0]).toMatchObject({
      problem: { kind: 'other', code: 'httpConnectionFailed' },
    });
    expect(failed(null)[0]).toMatchObject({ problem: { kind: 'other', code: 'turn_failed' } });
    expect(JSON.stringify(failed('unauthorized'))).not.toContain('you@company.com');
  });

  it('skips what it can not read, and notifications it has no step for', () => {
    const read = reader();
    expect(read('item/started', { item: 'nonsense' })).toEqual([]);
    expect(read('thread/tokenUsage/updated', { tokenUsage: {} })).toEqual([]);
    expect(read(...completed({ type: 'webSearch', id: 'w-1', query: 'x' }))).toEqual([]);
  });
});
