import type { ClaudeLimit } from '@devhub/contracts';
import { weekdays } from './calendar.ts';

/** "3:40 pm", as the limit's words write a time (spec 057, Q9). */
function twelveHour(time: Date): string {
  const hours = time.getHours() % 12 === 0 ? 12 : time.getHours() % 12;
  return `${String(hours)}:${String(time.getMinutes()).padStart(2, '0')} ${time.getHours() < 12 ? 'am' : 'pm'}`;
}

/**
 * How close you are to Claude's limit (spec 057, AC-45, Q9), as Home's and the Sessions page's callout and its
 * notification say it: "You've used 82% of your 5-hour Claude limit. It resets at 3:40 pm."
 */
export function limitLine(limit: ClaudeLimit, now: Date): string {
  const window = limit.window === 'five_hour' ? '5-hour' : 'weekly';
  const used = `You've used ${String(limit.usedPercent)}% of your ${window} Claude limit.`;
  if (limit.resetsAt === null) return used;
  const resets = new Date(limit.resetsAt);
  const sameDay = resets.toDateString() === now.toDateString();
  const when = sameDay ? `at ${twelveHour(resets)}` : `${weekdays[resets.getDay()] ?? ''} at ${twelveHour(resets)}`;
  return `${used} It resets ${when}.`;
}
