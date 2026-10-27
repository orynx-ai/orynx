import { homedir } from 'node:os';
import { join, sep } from 'node:path';

/** What Electron's `dialog.showMessageBox` takes, without importing Electron here. */
export interface Dialog {
  type: 'info' | 'warning' | 'error';
  message: string;
  detail: string;
  buttons: string[];
  defaultId: number;
  cancelId: number;
}

/** A folder as people read it: `~/.devhub` rather than `/Users/you/.devhub`. */
function shown(path: string): string {
  const home = homedir();
  return path === home || path.startsWith(`${home}${sep}`) ? `~${path.slice(home.length)}` : path;
}

/**
 * Cancel first and the main action last, as people read the dialog (the user's rule for every dialog).
 * macOS lays a message box's buttons out from the right, so there the main action comes first.
 */
function cancelThenAction(
  platform: NodeJS.Platform,
  cancel: string,
  action: string,
): Omit<Dialog, 'type' | 'message' | 'detail'> {
  return platform === 'darwin'
    ? { buttons: [action, cancel], defaultId: 0, cancelId: 1 }
    : { buttons: [cancel, action], defaultId: 1, cancelId: 0 };
}

/** Another hub already uses this home, such as `pnpm start` (Q2, AC-8). */
export function alreadyRunningDialog(home: string): Dialog {
  return {
    type: 'warning',
    message: 'Orynx is already running',
    detail: `Another Orynx is using ${shown(home)}, such as pnpm start in a terminal. Stop it, then open Orynx again.`,
    buttons: ['Quit'],
    defaultId: 0,
    cancelId: 0,
  };
}

/** The hub didn't start in time, or stopped (Q3, AC-9). Open again relaunches the app. */
export function stoppedDialog(home: string, platform: NodeJS.Platform): Dialog {
  return {
    type: 'error',
    message: 'Orynx stopped',
    detail: `Its server stopped. The log is in ${shown(join(home, 'logs', 'orynx.log'))}.`,
    ...cancelThenAction(platform, 'Quit', 'Open again'),
  };
}
