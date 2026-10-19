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

/** What the file picker answered (spec 022, B): one or more files, Cancel, or no picker at all. */
export type FilePickOutcome = { kind: 'picked'; paths: string[] } | { kind: 'cancelled' } | { kind: 'unavailable' };

/**
 * The computer's own file picker, letting you pick several files (spec 022, Q4): a browser never tells a page a
 * file's path, so File from this computer asks the local server, as Choose folder does.
 */
export interface FilePicker {
  pick(): Promise<FilePickOutcome>;
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

/** A picker's own way of writing what was picked: the paths, or null when its answer can't be read safely. */
type ReadAnswer<T> = (stdout: string) => T | null;

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

/**
 * Each OS's file pickers (spec 022). macOS's runs through JavaScript for Automation, which writes the paths as
 * JSON, so a file whose name holds a line break stays one file. Linux's write one path a line.
 */
const chooseFiles =
  'const app = Application.currentApplication(); app.includeStandardAdditions = true; JSON.stringify(app.chooseFile({ multipleSelectionsAllowed: true }).map((file) => file.toString()))';
const filePickers: Partial<Record<NodeJS.Platform, readonly Picker[]>> = {
  darwin: [
    {
      program: 'osascript',
      args: ['-l', 'JavaScript', '-e', chooseFiles],
      cancelled: (_code, stderr) => stderr.includes('(-128)'),
    },
  ],
  linux: [
    { program: 'zenity', args: ['--file-selection', '--multiple', '--separator=\n'], cancelled: quietExitOne },
    { program: 'kdialog', args: ['--getopenfilename', '--multiple', '--separate-output'], cancelled: quietExitOne },
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
function folderFrom(stdout: string): { path: string } | null {
  const path = pathFrom(stdout);
  return path === null ? null : { path };
}

/** macOS's JSON list of picked files; null unless it's one or more absolute paths. */
function filesFromJson(stdout: string): { paths: string[] } | null {
  let read: unknown;
  try {
    read = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!Array.isArray(read) || read.length === 0) return null;
  const paths = read.filter((path): path is string => typeof path === 'string' && isAbsolute(path));
  return paths.length === read.length ? { paths } : null;
}

/**
 * Linux's picked files, one a line; null unless every line is an absolute path. A name with a line break in it
 * would read as two, so the whole answer is refused rather than take a file nobody picked.
 */
function filesFromLines(stdout: string): { paths: string[] } | null {
  const paths = stdout.split(/\r?\n/).filter((line) => line !== '');
  return paths.length > 0 && paths.every((path) => isAbsolute(path)) ? { paths } : null;
}

function pathFrom(stdout: string): string | null {
  const line = stdout.replace(/\r?\n$/, '').trim();
  if (/[\r\n]/.test(line)) return null;
  const path = line.length > 1 ? line.replace(/[\\/]+$/, '') : line;
  return isAbsolute(path) ? path : null;
}

type Outcome<T> = ({ kind: 'picked' } & T) | { kind: 'cancelled' } | { kind: 'unavailable' };

/** Runs the first picker the OS has, one at a time: a second call while it's open waits for the same answer. */
function createPicker<T>(
  { searchPath, platform, timeoutMs = 10 * 60_000 }: FolderPickerOptions,
  table: Partial<Record<NodeJS.Platform, readonly Picker[]>>,
  readAnswer: (picker: Picker) => ReadAnswer<T>,
): { pick(): Promise<Outcome<T>> } {
  let open: Promise<Outcome<T>> | null = null;

  async function find(): Promise<{ path: string; picker: Picker } | null> {
    for (const picker of table[platform] ?? []) {
      for (const folder of searchPath.split(delimiter)) {
        // A relative folder would be looked up from wherever Orynx runs; skip it, as a shell does.
        if (!isAbsolute(folder)) continue;
        const path = join(folder, picker.program);
        if (await isProgram(path)) return { path, picker };
      }
    }
    return null;
  }

  function run(path: string, picker: Picker): Promise<Outcome<T>> {
    return new Promise((resolve) => {
      execFile(
        path,
        picker.args,
        // SIGKILL, so a picker left open past the limit is closed for sure. Paths are small; more is wrong.
        { timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024, encoding: 'utf8' },
        (error, stdout, stderr) => {
          if (error === null) {
            const picked = readAnswer(picker)(stdout);
            resolve(picked === null ? { kind: 'unavailable' } : { kind: 'picked', ...picked });
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

export function createFolderPicker(options: FolderPickerOptions): FolderPicker {
  return createPicker(options, pickers, () => folderFrom);
}

/** The file picker (spec 022): macOS answers in JSON, Linux one path a line. */
export function createFilePicker(options: FolderPickerOptions): FilePicker {
  return createPicker(options, filePickers, (picker) =>
    picker.program === 'osascript' ? filesFromJson : filesFromLines,
  );
}
