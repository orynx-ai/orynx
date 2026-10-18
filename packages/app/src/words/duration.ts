import { hour, minute } from './calendar.ts';

/** How long Claude has worked, as session.html writes it: "42 s", "4 min 12 s", then "1 h 4 min" (spec 011). */
export function durationText(ms: number): string {
  const elapsed = Math.max(0, ms);
  if (elapsed >= hour) {
    return `${String(Math.floor(elapsed / hour))} h ${String(Math.floor((elapsed % hour) / minute))} min`;
  }
  const seconds = `${String(Math.floor((elapsed % minute) / 1000))} s`;
  return elapsed >= minute ? `${String(Math.floor(elapsed / minute))} min ${seconds}` : seconds;
}
