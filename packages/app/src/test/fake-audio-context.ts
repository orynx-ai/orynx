/**
 * jsdom has no Web Audio; this browser-API stand-in records the notes a sound would play (spec 029). It fakes the
 * browser, not our code: a test reads what the real `sounds.ts` asked the browser for.
 */
export interface PlayedNote {
  type: string;
  frequency: number;
  /** Seconds after the context's start. */
  at: number;
  /** The loudest the note's gain ramps to. */
  peak: number;
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  /** What a new context starts as: `suspended` is a browser refusing sound before the page had a click. */
  static startState: 'running' | 'suspended' = 'running';

  readonly state = FakeAudioContext.startState;
  readonly currentTime = 0;
  readonly destination = {};
  readonly played: PlayedNote[] = [];
  closed = false;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createGain() {
    const gain = {
      peak: 0,
      gain: {
        setValueAtTime: () => undefined,
        exponentialRampToValueAtTime: (value: number) => {
          gain.peak = Math.max(gain.peak, value);
        },
      },
      connect: () => undefined,
    };
    return gain;
  }

  createOscillator() {
    let through: { peak: number } | null = null;
    const oscillator = {
      type: 'sine',
      frequency: { value: 0 },
      connect: (gain: { peak: number }) => {
        through = gain;
      },
      start: (at: number) => {
        this.played.push({
          type: oscillator.type,
          frequency: oscillator.frequency.value,
          at,
          peak: through?.peak ?? 0,
        });
      },
      stop: () => undefined,
    };
    return oscillator;
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  static reset(): void {
    FakeAudioContext.instances = [];
    FakeAudioContext.startState = 'running';
  }
}
