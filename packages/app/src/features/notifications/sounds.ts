import type { NotificationSound } from '@devhub/contracts';

export type PlayableSound = Exclude<NotificationSound, 'none'>;

/** Each sound's notes, as the design plays them: a frequency in Hz and when it starts, in seconds. */
const notes: Record<PlayableSound, readonly (readonly [number, number])[]> = {
  knock: [
    [392, 0],
    [392, 0.16],
  ],
  chime: [
    [880, 0],
    [1318.5, 0.12],
  ],
  ping: [[1568, 0]],
};

/** Settings › Notifications names them so. */
export const soundNames: Record<NotificationSound, string> = {
  knock: 'Knock',
  chime: 'Chime',
  ping: 'Ping',
  none: 'None',
};

/**
 * Plays a sound at `volume` (0–100) with Web Audio, as the design does: no sound files (spec 029). A browser that
 * won't play sound yet, because the page hasn't had a click, gets nothing: the sound is skipped, never queued.
 * Answers whether it played.
 */
export function playSound(sound: PlayableSound, volume: number): boolean {
  if (typeof window.AudioContext !== 'function') return false;
  try {
    const context = new window.AudioContext();
    if (context.state !== 'running') {
      void context.close();
      return false;
    }
    const peak = Math.max(0.0002, (volume / 100) * 0.35);
    for (const [frequency, offset] of notes[sound]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = context.currentTime + offset;
      oscillator.type = sound === 'knock' ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.4);
    }
    // The last note has ended by then.
    setTimeout(() => void context.close(), 1_000);
    return true;
  } catch {
    return false;
  }
}
