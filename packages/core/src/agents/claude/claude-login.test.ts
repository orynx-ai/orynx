import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../../events/event-bus.ts';
import { claudeEmail, claudeOrganisation, unusedWorkFolder, useFakeClaudeFolder } from '../../test/fake-claude.ts';
import { createClaudeCode, type ClaudeCodeProblem } from './claude-code.ts';
import { createClaudeLogin } from './claude-login.ts';

const fakeClaudeFolder = useFakeClaudeFolder();
const twoMinutes = 2 * 60_000;
const signedIn = { state: 'signed_in', method: 'claude_ai', email: claudeEmail, organisation: claudeOrganisation };

async function setup() {
  const folder = await fakeClaudeFolder();
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const problems: ClaudeCodeProblem[] = [];
  let now = 1_000_000;
  const login = createClaudeLogin({
    claudeCode: createClaudeCode({
      program: folder.program,
      env: { PATH: '/usr/bin:/bin' },
      workFolder: folder.workFolder,
    }),
    events,
    now: () => now,
    onProblem: (problem) => problems.push(problem),
  });
  return {
    folder,
    login,
    seen,
    problems,
    later: (ms: number) => {
      now += ms;
    },
  };
}

describe.skipIf(process.platform === 'win32')("Claude's login check", () => {
  it('AC-1, AC-2: reads the login and says Claude is connected', async () => {
    const { folder, login } = await setup();
    await folder.install({ kind: 'signed_in' });

    expect(await login.read()).toEqual(signedIn);
    expect(await login.connected()).toBe(true);
  });

  it('AC-4: signed out is not connected', async () => {
    const { folder, login } = await setup();
    await folder.install({ kind: 'signed_out' });

    expect(await login.read()).toEqual({ state: 'signed_out' });
    expect(await login.connected()).toBe(false);
  });

  it('AC-6: a failed check is an error, not connected, and tells only its kind and exit code', async () => {
    const { folder, login, problems } = await setup();
    await folder.install({ kind: 'crashes', exitCode: 2, stderr: `Signed in as ${claudeEmail}` });

    expect(await login.read()).toEqual({ state: 'error' });
    expect(await login.connected()).toBe(false);
    expect(problems).toEqual([{ kind: 'failed', exitCode: 2 }]);
  });

  it('AC-9: checks once, then answers from it for 2 minutes, and requests during a check share it', async () => {
    const { folder, login, later } = await setup();
    await folder.install({ kind: 'signed_in' });

    await Promise.all([login.read(), login.connected(), login.read()]);
    later(twoMinutes - 1);
    await login.read();
    await login.connected();

    expect(await folder.runs()).toHaveLength(1);
  });

  it('AC-9: after 2 minutes answers at once with the last result and checks again behind it', async () => {
    const { folder, login, seen, later } = await setup();
    await folder.install({ kind: 'signed_in' });
    await login.read();
    await folder.install({ kind: 'signed_out' });
    later(twoMinutes);

    expect(await login.read()).toEqual(signedIn);

    await expect.poll(() => seen).toEqual([{ type: 'status.changed' }]);
    expect(await login.read()).toEqual({ state: 'signed_out' });
    expect(await folder.runs()).toHaveLength(2);
  });

  it('AC-5: Check again checks at once and tells every page when the answer changed', async () => {
    const { folder, login, seen } = await setup();
    await folder.install({ kind: 'signed_out' });
    await login.read();
    await folder.install({ kind: 'signed_in' });

    expect(await login.checkNow()).toEqual(signedIn);
    expect(seen).toEqual([{ type: 'status.changed' }]);
    expect(await login.connected()).toBe(true);
    expect(await folder.runs()).toHaveLength(2);
  });

  it('AC-5: Check again that finds the same stays quiet', async () => {
    const { folder, login, seen } = await setup();
    await folder.install({ kind: 'signed_out' });
    await login.read();

    expect(await login.checkNow()).toEqual({ state: 'signed_out' });
    expect(seen).toEqual([]);
  });

  it('AC-12: with no program it is not connected and starts nothing', async () => {
    const events = createEventBus();
    const login = createClaudeLogin({
      claudeCode: createClaudeCode({ program: null, env: {}, workFolder: unusedWorkFolder }),
      events,
    });

    expect(await login.read()).toEqual({ state: 'error' });
    expect(await login.connected()).toBe(false);
  });
});
