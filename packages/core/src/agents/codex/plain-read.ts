import { readCommand } from '@devhub/contracts';

/**
 * Codex runs every look at your code as a command (`cat`, `rg`, `ls`), and `untrusted` asks before each (spec 052).
 * A plain read inside the worktree is decided as Claude's Read and Grep are, so it doesn't wait for you; anything else
 * goes to the rows in Settings. It still runs in the sandbox, which hides `DEVHUB_HOME`, the keychain and `~/.codex`.
 */

/** Programs that only read, each with the options that would make it do more. */
const readers: Record<string, readonly string[]> = {
  cat: [],
  head: [],
  tail: [],
  ls: [],
  pwd: [],
  wc: [],
  grep: [],
  // --pre runs a program on each file.
  rg: ['--pre'],
  // find's actions run programs, write files or delete.
  find: ['-exec', '-execdir', '-ok', '-okdir', '-delete', '-fprint', '-fprint0', '-fprintf', '-fls'],
};

/** git's reading subcommands; `--output` writes a file. */
const gitReaders = new Set(['status', 'diff', 'log', 'show', 'ls-files', 'blame', 'grep']);

/** The words a command reads, its words that aren't options; null when the command does anything but read. */
function readsOf(words: readonly string[]): string[] | null {
  const [program = '', ...rest] = words;
  if (program === 'git') {
    const [subcommand = '', ...args] = rest;
    if (!gitReaders.has(subcommand) || args.some((word) => word.startsWith('--output'))) return null;
    return args.filter((word) => !word.startsWith('-'));
  }
  const forbidden = readers[program];
  if (forbidden === undefined || rest.some((word) => forbidden.some((option) => word.startsWith(option)))) return null;
  return rest.filter((word) => !word.startsWith('-'));
}

/**
 * The words a plain read names, which the caller checks are inside the worktree: a pattern counts too, so one that
 * looks like a path outside it asks. Null for a line that writes, runs anything else, or the reader can't follow.
 */
export function plainReadPaths(command: string): string[] | null {
  const reading = readCommand(command);
  if (reading.kind !== 'command') return null;
  const paths: string[] = [];
  for (const words of reading.parts) {
    const reads = readsOf(words);
    if (reads === null) return null;
    paths.push(...reads);
  }
  return paths;
}

const shellWrapper = /^(?:\S*\/)?(?:bash|zsh|sh) -l?c (?:'([^']*)'|"([^"\\$`]*)"|([^\s'"]+))$/;

/** The line inside the shell Codex may wrap a command in (`bash -lc '…'`); any other line as it is. */
export function innerCommand(command: string): string {
  const wrapped = shellWrapper.exec(command.trim());
  return wrapped === null ? command : (wrapped[1] ?? wrapped[2] ?? wrapped[3] ?? command);
}
