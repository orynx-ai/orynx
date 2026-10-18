import { minute } from './calendar.ts';
import { waitText } from './tool-line.ts';

/** "just now" under a minute, then "12 min ago", "2 h ago" or "3 d ago" (Home's sync line, a session's start). */
export function agoText(ms: number): string {
  return ms < minute ? 'just now' : `${waitText(ms).short} ago`;
}
