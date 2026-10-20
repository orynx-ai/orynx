/**
 * What `lsof` and `ps` say, read (spec 042): which processes listen on which TCP ports, where each runs, and the
 * process table. Pure, so each format is tested as text.
 */

export interface Listener {
  pid: number;
  port: number;
}

export interface ProcessRow {
  pid: number;
  ppid: number;
  /** How long it has run. */
  seconds: number;
  command: string;
}

/** `lsof -nP -iTCP -sTCP:LISTEN -Fpn`: each port once, by the process listening on it, whatever its address. */
export function listenersFrom(output: string): Listener[] {
  const found: Listener[] = [];
  let pid = 0;
  for (const line of output.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    if (!line.startsWith('n') || pid === 0) continue;
    const port = Number(line.slice(line.lastIndexOf(':') + 1));
    if (Number.isInteger(port) && port > 0 && !found.some((one) => one.port === port)) found.push({ pid, port });
  }
  return found;
}

/** `lsof -a -d cwd -Fpn -p <pids>`: where each process runs. */
export function cwdsFrom(output: string): Map<number, string> {
  const cwds = new Map<number, string>();
  let pid = 0;
  for (const line of output.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    else if (line.startsWith('n') && pid !== 0) cwds.set(pid, line.slice(1));
  }
  return cwds;
}

/** `[[dd-]hh:]mm:ss`, as `ps -o etime` writes it on macOS and Linux; 0 for anything else. */
export function secondsOf(etime: string): number {
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(etime.trim());
  if (match === null) return 0;
  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match;
  return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds);
}

/** `ps -A -o pid=,ppid=,etime=,command=`. */
export function processesFrom(output: string): ProcessRow[] {
  return output.split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (match === null) return [];
    const [, pid = '0', ppid = '0', etime = '', command = ''] = match;
    return [{ pid: Number(pid), ppid: Number(ppid), seconds: secondsOf(etime), command }];
  });
}
