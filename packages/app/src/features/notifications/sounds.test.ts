import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext } from '../../test/fake-audio-context.ts';
import { playSound } from './sounds.ts';

beforeEach(() => {
  FakeAudioContext.reset();
  vi.stubGlobal('AudioContext', FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sounds (spec 029)', () => {
  it('AC-28: Knock is two low notes, at the volume asked', () => {
    expect(playSound('knock', 60)).toBe(true);

    expect(FakeAudioContext.instances[0]?.played).toEqual([
      { type: 'triangle', frequency: 392, at: 0, peak: 0.21 },
      { type: 'triangle', frequency: 392, at: 0.16, peak: 0.21 },
    ]);
  });

  it('AC-37: Chime and Ping are their own notes, and the volume scales them', () => {
    playSound('chime', 35);
    playSound('ping', 100);

    expect(FakeAudioContext.instances.map((context) => context.played.map((note) => note.frequency))).toEqual([
      [880, 1318.5],
      [1568],
    ]);
    expect(FakeAudioContext.instances[0]?.played[0]?.peak).toBeCloseTo(0.1225);
    expect(FakeAudioContext.instances[1]?.played[0]?.peak).toBeCloseTo(0.35);
  });

  it('closes its context once the notes have ended', () => {
    vi.useFakeTimers();
    playSound('ping', 60);
    expect(FakeAudioContext.instances[0]?.closed).toBe(false);

    vi.advanceTimersByTime(1_000);

    expect(FakeAudioContext.instances[0]?.closed).toBe(true);
    vi.useRealTimers();
  });

  it('skips the sound, never queues it, while the browser refuses sound', () => {
    FakeAudioContext.startState = 'suspended';

    expect(playSound('knock', 60)).toBe(false);

    expect(FakeAudioContext.instances[0]?.played).toEqual([]);
    expect(FakeAudioContext.instances[0]?.closed).toBe(true);
  });

  it('skips it in a browser with no Web Audio', () => {
    vi.stubGlobal('AudioContext', undefined);

    expect(playSound('knock', 60)).toBe(false);
  });
});
