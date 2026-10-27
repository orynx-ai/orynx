import { describe, expect, it } from 'vitest';
import { keepLast, logEnd, logRunEnded, logWork, type CommandLog } from './command-log.ts';

const lint = { kind: 'command', id: 'toolu_1', command: 'npm run lint' } as const;

describe('the command log', () => {
  it('AC-19: adds a command Claude was let run, running until it ends', () => {
    expect(logWork([], lint)).toEqual([{ id: 'toolu_1', state: 'running', command: 'npm run lint' }]);
  });

  it('AC-19: ends it with its output’s lines, colour codes removed, whether it failed, and its time', () => {
    const log = logWork([], lint);
    const ended = logEnd(log, {
      id: 'toolu_1',
      output: '\u001b[31m✗ 2 problems\u001b[0m\nsrc/a.ts\n',
      failed: true,
      ms: 1800.4,
    });
    expect(ended).toEqual([
      {
        id: 'toolu_1',
        state: 'failed',
        command: 'npm run lint',
        output: ['✗ 2 problems', 'src/a.ts'],
        cut: false,
        ms: 1800,
      },
    ]);
    expect(logEnd(log, { id: 'toolu_1', output: '', failed: false, ms: 5 })[0]).toMatchObject({
      state: 'done',
      output: [],
    });
  });

  it('AC-19: keeps the last 200 lines of a long output, and says some were dropped', () => {
    const output = Array.from({ length: 250 }, (_, line) => `line ${String(line + 1)}`).join('\n');
    const [ended] = logEnd(logWork([], lint), { id: 'toolu_1', output, failed: false, ms: 10 });
    expect(ended).toMatchObject({ cut: true });
    if (ended?.state !== 'done') throw new Error('the command ended');
    expect(ended.output).toHaveLength(200);
    expect(ended.output[0]).toBe('line 51');
  });

  it('AC-19: leaves out the end of a command it never saw start, and leaves an ended one as it was', () => {
    const log = logEnd(logWork([], lint), { id: 'toolu_1', output: 'ok', failed: false, ms: 1 });
    expect(logEnd(log, { id: 'toolu_9', output: 'x', failed: true, ms: 1 })).toEqual(log);
    expect(logEnd(log, { id: 'toolu_1', output: 'again', failed: true, ms: 1 })).toEqual(log);
  });

  it('AC-22: adds a command you denied, and one Orynx refused, with why', () => {
    let log: CommandLog = [];
    log = logWork(log, { kind: 'denied', about: 'command', text: 'npm install date-fns' });
    log = logWork(log, { kind: 'refused', refusal: { access: 'run', reason: 'push', path: 'git push --force' } });
    expect(log).toEqual([
      { id: 'denied-1', state: 'denied', command: 'npm install date-fns' },
      { id: 'refused-2', state: 'refused', command: 'git push --force', reason: 'push' },
    ]);
  });

  it('AC-19: leaves out work that isn’t a command: reads, edits, a denied edit, a refused read, the plan', () => {
    const others = [
      { kind: 'explore', file: 'src/a.ts' },
      { kind: 'edit', file: 'src/a.ts' },
      { kind: 'plan', items: ['Row selection'] },
      { kind: 'denied', about: 'edit', text: 'src/a.ts' },
      { kind: 'refused', refusal: { access: 'read', reason: 'outside_worktree', path: '/etc/hosts' } },
      { kind: 'finished', summary: 'Done.' },
    ] as const;
    expect(others.reduce<CommandLog>((log, work) => logWork(log, work), [])).toEqual([]);
  });

  it('AC-14 (spec 049): keeps the last 200 commands, oldest first, and counts every one it drops', () => {
    const full = Array.from({ length: 200 }, (_, n) =>
      logWork([], { kind: 'command', id: `toolu_${String(n)}`, command: `echo ${String(n)}` }),
    ).flat();
    const one = keepLast(logWork(full, { kind: 'command', id: 'toolu_200', command: 'echo 200' }), 0);
    expect(one.commandLog).toHaveLength(200);
    expect([one.commandLog[0]?.id, one.commandLog.at(-1)?.id]).toEqual(['toolu_1', 'toolu_200']);
    expect(one.commandsDropped).toBe(1);

    const two = keepLast(logWork(one.commandLog, { kind: 'command', id: 'toolu_201', command: 'ls' }), 1);
    expect(two.commandsDropped).toBe(2);
  });

  it('AC-15 (spec 049): leaves a shorter log as it is', () => {
    const log = logWork([], lint);
    expect(keepLast(log, 0)).toEqual({ commandLog: log, commandsDropped: 0 });
  });

  it('AC-14 (spec 049): a command denied after some were dropped still gets an id of its own', () => {
    const full = Array.from({ length: 200 }, (_, n) =>
      logWork([], { kind: 'command', id: `toolu_${String(n)}`, command: 'ls' }),
    ).flat();
    const log = logWork(full, { kind: 'denied', about: 'command', text: 'npm install date-fns' }, 5);
    expect(log.at(-1)).toEqual({ id: 'denied-206', state: 'denied', command: 'npm install date-fns' });
  });

  it('marks a command still running when Claude’s run ends as stopped, and leaves the rest', () => {
    const log = logWork(logEnd(logWork([], lint), { id: 'toolu_1', output: 'ok', failed: false, ms: 1 }), {
      kind: 'command',
      id: 'toolu_2',
      command: 'npm test',
    });
    expect(logRunEnded(log).map((entry) => entry.state)).toEqual(['done', 'stopped']);
  });
});
