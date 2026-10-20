import { describe, expect, it } from 'vitest';
import { sessionTools, type SessionToolsContext } from './session-tools.ts';

function setUp(answer: string | null = null) {
  const asked: unknown[] = [];
  const context: SessionToolsContext = {
    changeSteps: (change) => {
      asked.push(change);
      return Promise.resolve(answer);
    },
  };
  const tool = sessionTools(context).find((one) => one.name === 'set_steps');
  if (tool === undefined) throw new Error('set_steps should be there');
  return { tool, asked };
}

const steps = [
  { kind: 'setup', label: 'Set up' },
  { kind: 'run', label: 'Start server' },
  { kind: 'build', label: 'Fix env' },
];

describe('set_steps (spec 042)', () => {
  it('AC-24: runs without asking, and passes the whole list, the current step and the reason on', async () => {
    const { tool, asked } = setUp();
    expect(tool.asks({ steps, current: 'build', reason: 'x' })).toBeNull();
    expect(await tool.run({ steps, current: 'build', reason: 'The server fails on a missing env key.' })).toEqual({
      text: 'The steps are now: Set up · Start server · Fix env.',
    });
    expect(asked).toEqual([{ steps, current: 'build', reason: 'The server fails on a missing env key.' }]);
  });

  it('AC-25, AC-26: a change Orynx refuses comes back as an error with its reason, so Claude can send a better one', async () => {
    const { tool } = setUp('At most 5 steps, a pull request included.');
    expect(await tool.run({ steps, current: 'build', reason: 'r' })).toEqual({
      text: "Orynx didn't change the steps: At most 5 steps, a pull request included.",
      error: true,
    });
  });

  it('AC-25: input it can’t read is an error, and changes nothing', async () => {
    const { tool, asked } = setUp();
    for (const input of [
      {},
      { steps: 'all', current: 'build', reason: 'r' },
      { steps, current: 'deploy', reason: 'r' },
    ])
      expect((await tool.run(input)).error).toBe(true);
    expect(asked).toEqual([]);
  });
});
