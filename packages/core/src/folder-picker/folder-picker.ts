import { execFile } from 'node:child_process';
import { access, constants, stat } from 'node:fs/promises';
import { delimiter, isAbsolute, join } from 'node:path';

/**
 * The computer's own folder picker (spec 020, AC-35): a browser never tells a page a folder's full path,
 * so Choose folder asks the local server, which opens the OS's picker and answers the path. It runs a
 * fixed command that holds nothing the page sent, and only when the person presses the button.
 */
export type FolderPickOutcome =
  | { kind: 'picked'; path: string }
  /** The person closed the picker without choosing. */
  | { kind: 'cancelled' }
  /** No picker could open here: none is installed, or there is no screen to show it on (AC-36). */
  | { kind: 'unavailable' };

export interface FolderPicker {
  /** Opens the picker and waits for the person. A second call while it's open waits for the same answer. */
  pick(): Promise<FolderPickOutcome>;
}

export interface FolderPickerOptions {
  /**
   * Folders to look in for the picker program, joined like PATH. The host passes its PATH; tests pass a
   * folder with a fake one. Empty finds nothing, so no test can open a real picker on the screen.
   */
  searchPath: string;
  platform: NodeJS.Platform;
  /** How long the picker may stay open; 10 minutes by default, then it's closed and counts as cancelled. */
  timeoutMs?: number;
}

interface Picker {
  program: string;
  args: string[];
  /** Whether a failed run means the person cancelled, rather than that no picker could open. */
  cancelled: (exitCode: number | null, stderr: string) => boolean;
}

/**
 * Each OS's pickers, in the order they're tried. A quiet exit 1 is a Cancel; one with words is a failure.
 * Windows has none yet: a folder's path in Orynx starts with / or ~ (RepositoryPathSchema), which a Windows
 * path never does.
 */
const pickers: Partial<Record<NodeJS.Platform, readonly Picker[]>> = {
  // AppleScript says "User canceled. (-128)" when the person presses Cancel.
  darwin: [
    {
      program: 'osascript',
      args: ['-e', 'POSIX path of (choose folder)'],
      cancelled: (_code, stderr) => stderr.includes('(-128)'),
    },
  ],
  linux: [
    { program: 'zenity', args: ['--file-selection', '--directory'], cancelled: quietExitOne },
    { program: 'kdialog', args: ['--getexistingdirectory'], cancelled: quietExitOne },
  ],
};

/** GTK's own notes, such as zenity's "GtkDialog mapped without a transient parent", say nothing went wrong. */
const gtkNote = /^Gtk-(?:Message|WARNING)\b/;

function quietExitOne(exitCode: number | null, stderr: string): boolean {
  const said = stderr.split(/\r?\n/).filter((line) => line.trim() !== '' && !gtkNote.test(line));
  return exitCode === 1 && said.length === 0;
}

async function isProgram(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The picked folder as the picker printed it, without a trailing newline or slash; null when it's no path,
 * or when a line break inside it would cut it down to another folder.
 */
function pathFrom(stdout: string): string | null {
  const line = stdout.replace(/\r?\n$/, '').trim();
  if (/[\r\n]/.test(line)) return null;
  const path = line.length > 1 ? line.replace(/[\\/]+$/, '') : line;
  return isAbsolute(path) ? path : null;
}

export function createFolderPicker({
  searchPath,
  platform,
  timeoutMs = 10 * 60_000,
}: FolderPickerOptions): FolderPicker {
  let open: Promise<FolderPickOutcome> | null = null;

  async function find(): Promise<{ path: string; picker: Picker } | null> {
    for (const picker of pickers[platform] ?? []) {
      for (const folder of searchPath.split(delimiter)) {
        // A relative folder would be looked up from wherever Orynx runs; skip it, as a shell does.
        if (!isAbsolute(folder)) continue;
        const path = join(folder, picker.program);
        if (await isProgram(path)) return { path, picker };
      }
    }
    return null;
  }

  function run(path: string, picker: Picker): Promise<FolderPickOutcome> {
    return new Promise((resolve) => {
      execFile(
        path,
        picker.args,
        // SIGKILL, so a picker left open past the limit is closed for sure. A path is small; more is wrong.
        { timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 64 * 1024, encoding: 'utf8' },
        (error, stdout, stderr) => {
          if (error === null) {
            const picked = pathFrom(stdout);
            resolve(picked === null ? { kind: 'unavailable' } : { kind: 'picked', path: picked });
          } else if (error.killed) {
            resolve({ kind: 'cancelled' });
          } else {
            const exitCode = typeof error.code === 'number' ? error.code : null;
            resolve(picker.cancelled(exitCode, stderr) ? { kind: 'cancelled' } : { kind: 'unavailable' });
          }
        },
      );
    });
  }

  return {
    pick() {
      open ??= find()
        .then((found) => (found === null ? { kind: 'unavailable' as const } : run(found.path, found.picker)))
        .finally(() => {
          open = null;
        });
      return open;
    },
  };
}
