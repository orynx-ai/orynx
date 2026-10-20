import type { SessionPort } from '@devhub/contracts';
import { hour, minute } from '../../words/calendar.ts';

/** The Ports tab's words (spec 042, Q11). */
export const portWords = {
  tab: 'Ports',
  list: 'Ports',
  empty: 'Nothing listens from this session. Servers Claude or you start here show up on their own.',
  unreadable: "Couldn't read the ports.",
  tryAgain: 'Try again',
  open: (address: string) => `Open ${address}`,
  copy: (address: string) => `Copy ${address}`,
  copied: 'Copied',
  restart: (address: string) => `Restart ${address}`,
  stop: (address: string) => `Stop ${address}`,
  runAgain: 'Run again in Terminal',
  typed: 'Typed it in a new Terminal tab: open Terminal to run it.',
  confirmTitle: (address: string) => `Stop ${address}?`,
  confirmBody: "Orynx didn't start it: it was found running from this session's worktree.",
  cancel: 'Cancel',
  confirmStop: 'Stop',
};

const startedByWords: Record<SessionPort['startedBy'], string> = {
  claude: 'Claude',
  you: 'You',
  found: 'Found in the worktree',
};

/** "localhost:3005". */
export function addressOf(port: Pick<SessionPort, 'port'>): string {
  return `localhost:${String(port.port)}`;
}

/** Who started it and for how long it has listened: "Claude · 4 min", "You · 2 h". */
export function portMeta(port: Pick<SessionPort, 'startedBy' | 'since'>, now: Date): string {
  const ms = Math.max(0, now.getTime() - Date.parse(port.since));
  const listened =
    ms >= hour
      ? `${String(Math.floor(ms / hour))} h`
      : ms >= minute
        ? `${String(Math.floor(ms / minute))} min`
        : 'under a minute';
  return `${startedByWords[port.startedBy]} · ${listened}`;
}

/** What deleting a session stops (spec 042, AC-13): "Stops 1 server (localhost:3005)."; null when nothing listens. */
export function stopsServers(ports: readonly Pick<SessionPort, 'port'>[]): string | null {
  if (ports.length === 0) return null;
  const servers = ports.length === 1 ? 'server' : 'servers';
  return `Stops ${String(ports.length)} ${servers} (${ports.map(addressOf).join(', ')}).`;
}
