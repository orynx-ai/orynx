/** What the standup is drafted from (spec 057, C): plain facts, so the template is tested on its own. */
export interface StandupFacts {
  merged: { number: number; title: string; ticket: string | null }[];
  opened: { number: number; title: string; ticket: string | null }[];
  moved: { key: string; status: string }[];
  reviewed: { repository: string; number: number }[];
  /** Sessions that finished without a pull request. */
  finished: { title: string; ticket: string | null }[];
  /** Your tickets in progress in the current sprint. */
  today: { key: string; title: string; status: string }[];
  /** Sessions waiting on you. */
  waiting: { title: string }[];
}

const day = 86_400_000;

/** `YYYY-MM-DD` on the laptop's clock. */
export function calendarDay(date: Date): string {
  const two = (value: number) => String(value).padStart(2, '0');
  return `${String(date.getFullYear())}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** The last working day before `now` (AC-29): yesterday on Tuesday to Friday, else Friday. */
export function lastWorkingDay(now: Date): string {
  // Sunday is 0: Monday goes back 3 days, Sunday 2, Saturday 1, any other day 1.
  const back = [2, 3, 1, 1, 1, 1, 1][now.getDay()] ?? 1;
  const noon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return calendarDay(new Date(noon.getTime() - back * day));
}

const nothingFound = '• Nothing found. Add your own.';
const withTicket = (title: string, ticket: string | null) => (ticket === null ? title : `${title} (${ticket})`);

/** The draft (AC-28): Yesterday, Today and Blockers, in `•` bullets that paste into Slack and Discord. */
export function standupText(facts: StandupFacts): string {
  const yesterday = [
    ...facts.merged.map(({ number, title, ticket }) => `• Merged #${String(number)} ${withTicket(title, ticket)}`),
    ...facts.opened.map(({ number, title, ticket }) => `• Opened #${String(number)} ${withTicket(title, ticket)}`),
    ...facts.moved.map(({ key, status }) => `• Moved ${key} to ${status}`),
    ...facts.reviewed.map(({ repository, number }) => `• Reviewed ${repository} #${String(number)}`),
    ...facts.finished.map(({ title, ticket }) => `• Finished ${withTicket(title, ticket)}`),
  ];
  const today = [
    ...facts.today.map(({ key, title, status }) => `• ${key} ${title} (${status})`),
    ...facts.waiting.map(({ title }) => `• ${title} (Claude is waiting for you)`),
  ];
  return [
    'Yesterday',
    ...(yesterday.length === 0 ? [nothingFound] : yesterday),
    '',
    'Today',
    ...(today.length === 0 ? [nothingFound] : today),
    '',
    'Blockers',
    '• None',
  ].join('\n');
}
