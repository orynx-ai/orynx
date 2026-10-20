import { describe, expect, it } from 'vitest';
import { sessionTools, type SessionToolsContext } from './session-tools.ts';

const serverAsk = {
  kind: 'server',
  command: 'next dev --port 3005',
  folder: 'apps/web',
  alwaysAllow: 'server:2e44184c6076885d',
} as const;

function setUp(
  answer: string | null = null,
  started: Awaited<ReturnType<SessionToolsContext['startServer']>> = { port: 3005, url: 'https://localhost:3005' },
) {
  const asked: unknown[] = [];
  const context: SessionToolsContext = {
    changeSteps: (change) => {
      asked.push(change);
      return Promise.resolve(answer);
    },
    serverAsk: (command, folder) => {
      asked.push({ ask: command, folder });
      return Promise.resolve(serverAsk);
    },
    startServer: (command, folder) => {
      asked.push({ start: command, folder });
      return Promise.resolve(started);
    },
  };
  const tools = sessionTools(context);
  const named = (name: string) => {
    const found = tools.find((one) => one.name === name);
    if (found === undefined) throw new Error(`${name} should be there`);
    return found;
  };
  return { tool: named('set_steps'), server: named('start_server'), asked };
}

const steps = [
  { kind: 'setup', label: 'Set up' },
  { kind: 'run', label: 'Start server' },
  { kind: 'build', label: 'Fix env' },
];

describe('set_steps (spec 042)', () => {
  it('AC-24: runs without asking, and passes the whole list, the current step and the reason on', async () => {
    const { tool, asked } = setUp();
    expect(await tool.asks({ steps, current: 'build', reason: 'x' })).toBeNull();
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

describe('start_server (spec 042)', () => {
  it('AC-2: asks you first, with the command and where it runs', async () => {
    const { server, asked } = setUp();
    expect(await server.asks({ command: 'next dev --port 3005', folder: 'apps/web' })).toEqual(serverAsk);
    expect(asked).toEqual([{ ask: 'next dev --port 3005', folder: 'apps/web' }]);
  });

  it('AC-2: once allowed, answers with the address it listens on', async () => {
    const { server, asked } = setUp();
    expect(await server.run({ command: 'next dev --port 3005' })).toEqual({
      text: 'It listens on https://localhost:3005, in its own Terminal tab. It keeps running after you finish; stop it with stop_server.',
    });
    expect(asked).toEqual([{ start: 'next dev --port 3005', folder: '.' }]);
  });

  it('AC-2: a server that never listens answers with its last lines', async () => {
    const { server } = setUp(null, { lines: ['Error: Missing env key DATABASE_URL'] });
    expect(await server.run({ command: 'pnpm dev' })).toEqual({
      text: 'Nothing listened within 60 seconds. Its last lines:\nError: Missing env key DATABASE_URL',
      error: true,
    });
  });

  it('AC-37: where servers can’t start, says so', async () => {
    const { server } = setUp(null, { refused: "Servers can't start on this computer." });
    expect(await server.run({ command: 'pnpm dev' })).toEqual({
      text: "Servers can't start on this computer.",
      error: true,
    });
  });

  it('input it can’t read is an error', async () => {
    const { server } = setUp();
    expect((await server.run({ command: '' })).error).toBe(true);
    expect(await server.asks({})).toBeNull();
  });
});
