import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../../events/event-bus.ts';
import { useFakeCodex, type FakeCodex } from '../../test/fake-codex.ts';
import { createCodexLogin, type CodexCheckProblem } from './codex-login.ts';

const fakeCodex = useFakeCodex();
const twoMinutes = 2 * 60_000;
const email = 'fake-codex-user@company.example';

async function setup(program: 'fake' | 'none' = 'fake') {
  const fake = await fakeCodex();
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const problems: CodexCheckProblem[] = [];
  let now = 1_000_000;
  const login = createCodexLogin({
    program: program === 'fake' ? fake.program : null,
    env: { PATH: '/usr/bin:/bin' },
    args: ['app-server', '-c', 'analytics.enabled=false'],
    workFolder: join(await mkdtemp(join(tmpdir(), 'orynx-codex-check-')), 'codex-check'),
    events,
    now: () => now,
    onProblem: (problem) => problems.push(problem),
  });
  return {
    fake,
    login,
    seen,
    problems,
    later: (ms: number) => {
      now += ms;
    },
  };
}

/** Plays Codex for one check: answers `initialize`, then `account/read` with this. */
async function answerAccount(fake: FakeCodex, result: unknown): Promise<unknown> {
  const codex = await fake.next();
  codex.reply((await codex.expectRequest('initialize')).id, {});
  await codex.read(); // initialized
  const { id, params } = await codex.expectRequest('account/read');
  codex.reply(id, result);
  return params;
}

describe.skipIf(process.platform === 'win32')("Codex's login check (spec 052)", () => {
  it('AC-1: reads the ChatGPT login with account/read alone, never a prompt, and says Codex is connected', async () => {
    const { fake, login } = await setup();
    const reading = login.read();
    const asked = await answerAccount(fake, {
      account: { type: 'chatgpt', email, planType: 'enterprise' },
      requiresOpenaiAuth: true,
    });

    expect(await reading).toEqual({ state: 'signed_in', method: 'chatgpt', email });
    expect(asked).toEqual({ refreshToken: false });
    expect(await login.connected()).toBe(true);
    const runs = await fake.runs();
    expect(runs.map((run) => run.args)).toEqual([['--version'], ['app-server', '-c', 'analytics.enabled=false']]);
    expect(runs[1]?.cwd).toMatch(/codex-check$/);
  });

  it('AC-1: an API key, or a way Orynx does not name, is signed in with no account', async () => {
    const { fake, login } = await setup();
    const reading = login.read();
    await answerAccount(fake, { account: { type: 'apiKey' }, requiresOpenaiAuth: true });
    expect(await reading).toEqual({ state: 'signed_in', method: 'api_key', email: null });

    const again = login.checkNow();
    await answerAccount(fake, { account: { type: 'amazonBedrock' }, requiresOpenaiAuth: false });
    expect(await again).toEqual({ state: 'signed_in', method: 'other', email: null });
  });

  it('AC-2: no account while OpenAI wants one is signed out, and not connected', async () => {
    const { fake, login } = await setup();
    const reading = login.read();
    await answerAccount(fake, { account: null, requiresOpenaiAuth: true });

    expect(await reading).toEqual({ state: 'signed_out' });
    expect(await login.connected()).toBe(false);
  });

  it('AC-2: no Codex, or one older than 0.166, is not installed, and no app-server starts', async () => {
    const missing = await setup('none');
    expect(await missing.login.read()).toEqual({ state: 'not_installed' });

    const old = await setup();
    await old.fake.printsVersion('codex-cli 0.150.0\n');
    expect(await old.login.read()).toEqual({ state: 'not_installed' });
    expect((await old.fake.runs()).map((run) => run.args)).toEqual([['--version']]);
  });

  it('AC-2: a check that fails is an error, and tells only its kind, never what Codex said', async () => {
    const { fake, login, problems } = await setup();
    const reading = login.read();
    const codex = await fake.next();
    codex.reply((await codex.expectRequest('initialize')).id, {});
    await codex.read();
    codex.fail((await codex.expectRequest('account/read')).id, -32600, `token for ${email} expired`);

    expect(await reading).toEqual({ state: 'error' });
    expect(problems).toEqual([{ kind: 'failed' }]);
    expect(JSON.stringify(problems)).not.toContain(email);
  });

  it('AC-2: an answer Orynx can not read is an error', async () => {
    const { fake, login, problems } = await setup();
    const reading = login.read();
    await answerAccount(fake, { account: 'yes' });

    expect(await reading).toEqual({ state: 'error' });
    expect(problems).toEqual([{ kind: 'unreadable' }]);
  });

  it('asks again only after 2 minutes, at once on Check again, and says when the answer changed', async () => {
    const { fake, login, seen, later } = await setup();
    const first = login.read();
    await answerAccount(fake, { account: null, requiresOpenaiAuth: true });
    await first;
    expect(await login.read()).toEqual({ state: 'signed_out' });
    later(twoMinutes - 1);
    expect(await login.read()).toEqual({ state: 'signed_out' });

    const checking = login.checkNow();
    await answerAccount(fake, { account: { type: 'chatgpt', email }, requiresOpenaiAuth: true });
    expect(await checking).toEqual({ state: 'signed_in', method: 'chatgpt', email });
    expect(seen.filter((event) => event.type === 'status.changed').length).toBeGreaterThanOrEqual(1);
    expect((await fake.runs()).filter((run) => run.args[0] === 'app-server')).toHaveLength(2);
  });
});
