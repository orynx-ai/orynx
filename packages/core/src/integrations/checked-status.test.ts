import { describe, expect, it } from 'vitest';
import type { IntegrationStatus, ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../events/event-bus.ts';
import { createCheckedStatus } from './checked-status.ts';

const twoMinutes = 2 * 60_000;
const connected: IntegrationStatus = { state: 'connected', detail: 'Signed in as octocat' };
const failing: IntegrationStatus = { state: 'error', detail: "Can't reach the tool." };

/** A check the test answers by hand, so it can be held open while other callers arrive. */
function setup() {
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  let now = 1_000_000;
  const asked: string[] = [];
  const waiting: ((status: IntegrationStatus) => void)[] = [];
  const errors: unknown[] = [];
  let failNext = false;
  const checked = createCheckedStatus<{ account: string }>({
    keyOf: (saved) => saved.account,
    check: (saved) => {
      asked.push(saved.account);
      if (failNext) {
        failNext = false;
        return Promise.reject(new Error('broken check'));
      }
      return new Promise((resolve) => waiting.push(resolve));
    },
    events,
    forgotten: { state: 'not_connected', detail: null },
    now: () => now,
    onError: (error) => errors.push(error),
  });
  return {
    checked,
    seen,
    asked,
    errors,
    /** Answers the oldest check still open. */
    answer: async (status: IntegrationStatus) => {
      waiting.shift()?.(status);
      await Promise.resolve();
    },
    later: (ms: number) => {
      now += ms;
    },
    failNextCheck: () => {
      failNext = true;
    },
  };
}

describe('checked status', () => {
  it('waits for the first check, then answers from it for 2 minutes', async () => {
    const { checked, asked, answer, later } = setup();

    const first = checked.get({ account: 'a' });
    await answer(connected);
    expect(await first).toEqual(connected);
    later(twoMinutes - 1);

    expect(await checked.get({ account: 'a' })).toEqual(connected);
    expect(asked).toEqual(['a']);
  });

  it('shares one running check between everyone asking', async () => {
    const { checked, asked, answer } = setup();

    const both = Promise.all([checked.get({ account: 'a' }), checked.get({ account: 'a' })]);
    await answer(connected);

    expect(await both).toEqual([connected, connected]);
    expect(asked).toEqual(['a']);
  });

  it('after 2 minutes answers at once with the last result, and says when the re-check changes it', async () => {
    const { checked, asked, seen, answer, later } = setup();
    const first = checked.get({ account: 'a' });
    await answer(connected);
    await first;
    later(twoMinutes);

    expect(await checked.get({ account: 'a' })).toEqual(connected);
    expect(asked).toEqual(['a', 'a']);
    expect(seen).toEqual([]);
    await answer(failing);

    expect(await checked.get({ account: 'a' })).toEqual(failing);
    expect(seen).toEqual([{ type: 'status.changed' }]);
  });

  it('stays quiet when the re-check finds the same', async () => {
    const { checked, seen, answer, later } = setup();
    const first = checked.get({ account: 'a' });
    await answer(connected);
    await first;
    later(twoMinutes);

    await checked.get({ account: 'a' });
    await answer(connected);

    expect(seen).toEqual([]);
  });

  it('checks again at once for other saved settings', async () => {
    const { checked, asked, answer } = setup();
    const first = checked.get({ account: 'a' });
    await answer(connected);
    await first;

    const second = checked.get({ account: 'b' });
    await answer(failing);

    expect(await second).toEqual(failing);
    expect(asked).toEqual(['a', 'b']);
  });

  it("keeps a connect's answer when a check that started before it finishes later", async () => {
    const { checked, answer } = setup();
    const before = checked.get({ account: 'a' });

    checked.settle({ account: 'a' }, connected);
    await answer(failing);

    expect(await before).toEqual(connected);
    expect(await checked.get({ account: 'a' })).toEqual(connected);
  });

  it('checks again after forget, and a check from before forget says not connected', async () => {
    const { checked, asked, answer } = setup();
    const before = checked.get({ account: 'a' });

    checked.forget();
    await answer(connected);

    expect(await before).toEqual({ state: 'not_connected', detail: null });
    const after = checked.get({ account: 'a' });
    await answer(connected);
    expect(await after).toEqual(connected);
    expect(asked).toEqual(['a', 'a']);
  });

  it('hands a failed re-check to onError and keeps the last result', async () => {
    const { checked, errors, answer, later, failNextCheck } = setup();
    const first = checked.get({ account: 'a' });
    await answer(connected);
    await first;
    later(twoMinutes);
    failNextCheck();

    expect(await checked.get({ account: 'a' })).toEqual(connected);

    await expect.poll(() => errors).toEqual([new Error('broken check')]);
    expect(await checked.get({ account: 'a' })).toEqual(connected);
  });
});

describe('checked status, checked now', () => {
  it('Check again checks at once within the 2 minutes, and says when the answer changed', async () => {
    const { checked, asked, seen, answer } = setup();
    const first = checked.get({ account: 'a' });
    await answer(failing);
    await first;

    const now = checked.checkNow({ account: 'a' });
    await answer(connected);

    expect(await now).toEqual(connected);
    expect(await checked.get({ account: 'a' })).toEqual(connected);
    expect(asked).toEqual(['a', 'a']);
    expect(seen).toEqual([{ type: 'status.changed' }]);
  });

  it('AC-7: Check again shares a check that is already running, so a second press starts none', async () => {
    const { checked, asked, answer } = setup();
    const first = checked.get({ account: 'a' });

    const presses = Promise.all([checked.checkNow({ account: 'a' }), checked.checkNow({ account: 'a' })]);
    await answer(connected);

    expect(await first).toEqual(connected);
    expect(await presses).toEqual([connected, connected]);
    expect(asked).toEqual(['a']);
  });

  it('starts the 2 minutes again from a Check again', async () => {
    const { checked, asked, answer, later } = setup();
    const first = checked.get({ account: 'a' });
    await answer(connected);
    await first;
    later(twoMinutes - 1);

    const now = checked.checkNow({ account: 'a' });
    await answer(connected);
    await now;
    later(twoMinutes - 1);

    expect(await checked.get({ account: 'a' })).toEqual(connected);
    expect(asked).toEqual(['a', 'a']);
  });
});

describe('checked status with an answer of its own shape', () => {
  type Login = { state: 'signed_in'; email: string } | { state: 'signed_out' };

  it('AC-9: compares answers by value, so an equal answer stays quiet and a new one says so', async () => {
    const events = createEventBus();
    const seen: ServerEvent[] = [];
    events.subscribe((event) => seen.push(event));
    let now = 0;
    let next: Login = { state: 'signed_in', email: 'you@company.com' };
    const checked = createCheckedStatus<undefined, Login>({
      keyOf: () => 'claude',
      // A fresh object each time, so only its value can make two answers the same.
      check: () => Promise.resolve(structuredClone(next)),
      events,
      forgotten: { state: 'signed_out' },
      now: () => now,
    });

    await checked.get(undefined);
    await checked.checkNow(undefined);
    expect(seen).toEqual([]);

    next = { state: 'signed_out' };
    now += twoMinutes;
    await checked.get(undefined);
    await expect.poll(() => seen).toEqual([{ type: 'status.changed' }]);
    expect(await checked.get(undefined)).toEqual({ state: 'signed_out' });
  });
});
