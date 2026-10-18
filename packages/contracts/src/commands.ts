import { z } from 'zod';

/**
 * How Orynx reads a command Claude wants to run (spec 012, Q3). The same reading decides what asks in a
 * session and what Settings › Coding agent takes on the allow list, so the form and the server agree.
 * It follows the shell only as far as a command's words: a command it can't follow is `opaque`, which
 * asks and never matches the list.
 */

/**
 * Why a command asks in every mode (Q3), whatever the list says: it reaches the network, deletes outside
 * the worktree, or asked to run outside the sandbox (which only the call's input can say).
 */
export const AlwaysAskReasonSchema = z.enum(['network', 'delete_outside', 'unsandboxed']);
export type AlwaysAskReason = z.infer<typeof AlwaysAskReasonSchema>;

export type CommandReading =
  /** Pushes or opens a pull request: refused, never asked (Q7). */
  | { kind: 'push' }
  /** Asks in every mode, with Allow once and Deny only, and can't go on the list. */
  | { kind: 'always_asks'; reason: Exclude<AlwaysAskReason, 'unsandboxed'> }
  /**
   * The words of each command in the line, split at `&&`, `||`, `;`, `|` and newlines. `entry` is what
   * Always allow saves (Q4); null when the line holds several commands.
   */
  | { kind: 'command'; parts: string[][]; entry: string | null }
  /** Holds something the reader won't follow: a substitution, a redirection, `sudo`, an unclosed quote… */
  | { kind: 'opaque' };

const opaque: CommandReading = { kind: 'opaque' };

/** The words of each command in the line, or null when the line holds shell the reader won't follow. */
function scan(line: string): string[][] | null {
  const parts: string[][] = [];
  let words: string[] = [];
  let word = '';
  let inWord = false;
  let quote: '"' | "'" | null = null;

  const endWord = () => {
    if (!inWord) return;
    words.push(word);
    word = '';
    inWord = false;
  };
  /** Ends the command at an operator; false when there was none before it. */
  const endPart = (): boolean => {
    endWord();
    if (words.length === 0) return false;
    parts.push(words);
    words = [];
    return true;
  };

  for (let i = 0; i < line.length; i += 1) {
    const c = line[i] ?? '';
    const next = line[i + 1] ?? '';
    if (quote === "'") {
      if (c === "'") quote = null;
      else word += c;
      continue;
    }
    if (quote === '"') {
      if (c === '"') {
        quote = null;
      } else if (c === '\\' && '"\\$`'.includes(next) && next !== '') {
        word += next;
        i += 1;
      } else if ((c === '$' && next === '(') || c === '`') {
        return null;
      } else {
        word += c;
      }
      continue;
    }
    switch (c) {
      case '\\':
        if (next === '') return null;
        word += next;
        inWord = true;
        i += 1;
        continue;
      case '"':
      case "'":
        quote = c;
        inWord = true;
        continue;
      case '`':
      case '(':
      case ')':
        return null;
      case '$':
        if (next === '(') return null;
        break;
      case ' ':
      case '\t':
        endWord();
        continue;
      case '\n':
      case ';':
        // A trailing or doubled separator ends nothing, as `npm test;` is fine.
        endPart();
        continue;
      case '&':
        // `&&` joins commands; a single `&` would run one in the background.
        if (next !== '&' || !endPart()) return null;
        i += 1;
        continue;
      case '|':
        if (!endPart()) return null;
        if (next === '|') i += 1;
        continue;
      case '>':
      case '<':
        // The one redirection that changes nothing on disk: stderr into stdout, as `2>&1`.
        if (c === '>' && word === '2' && inWord && line.startsWith('>&1', i) && isBoundary(line[i + 3])) {
          word = '2>&1';
          i += 2;
          continue;
        }
        return null;
      default:
        break;
    }
    word += c;
    inWord = true;
  }
  if (quote !== null) return null;
  endPart();
  return parts.length === 0 ? null : parts;
}

function isBoundary(c: string | undefined): boolean {
  return c === undefined || ' \t\n;|&'.includes(c);
}

/** The program's own name: `make` for `/usr/bin/make`. */
function programOf(words: readonly string[]): string {
  const first = words[0] ?? '';
  return first.slice(first.lastIndexOf('/') + 1);
}

const assignment = /^[A-Za-z_][A-Za-z0-9_]*=/;
const shells = new Set(['sh', 'bash', 'zsh', 'dash']);

/** Shell the reader won't follow, so the command asks and never matches (Q3). */
function unfollowed(words: readonly string[]): boolean {
  const first = words[0] ?? '';
  if (assignment.test(first)) return true;
  const program = programOf(words);
  if (program === 'eval' || program === 'sudo') return true;
  return shells.has(program) && words.includes('-c');
}

/** Options come first: `-C x push` is still a push. The named ones take the next word with them. */
const gitOptionsWithValue = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);

function gitSubcommand(words: readonly string[]): string | null {
  for (let i = 1; i < words.length; i += 1) {
    const word = words[i] ?? '';
    if (gitOptionsWithValue.has(word)) i += 1;
    else if (!word.startsWith('-')) return word;
  }
  return null;
}

/** The first word after the program that isn't an option. */
function subcommandOf(words: readonly string[]): string | null {
  return words.slice(1).find((word) => !word.startsWith('-')) ?? null;
}

function pushes(words: readonly string[]): boolean {
  const program = programOf(words);
  if (program === 'git') return gitSubcommand(words) === 'push';
  return program === 'gh' && words[1] === 'pr' && words[2] === 'create';
}

const networkPrograms = new Set([
  'curl',
  'wget',
  'ssh',
  'scp',
  'sftp',
  'rsync',
  'nc',
  'ncat',
  'telnet',
  'ftp',
  'gh',
  'npx',
  'pnpx',
  'brew',
  'apt',
  'apt-get',
]);
const gitNetwork = new Set(['fetch', 'pull', 'clone', 'ls-remote', 'submodule']);
const packageManagers = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const installs = new Set(['install', 'i', 'add', 'ci', 'update', 'dlx']);
const url = /https?:\/\//i;

function reachesNetwork(words: readonly string[]): boolean {
  const program = programOf(words);
  if (networkPrograms.has(program)) return true;
  const sub = subcommandOf(words);
  if (program === 'git') return gitNetwork.has(gitSubcommand(words) ?? '');
  // `yarn` on its own installs.
  if (packageManagers.has(program)) return sub === null ? program === 'yarn' : installs.has(sub);
  if (program === 'pip' || program === 'pip3') return sub === 'install';
  if (program === 'docker') return sub === 'pull' || sub === 'push';
  return false;
}

const deleters = new Set(['rm', 'rmdir', 'unlink', 'mv']);

/** A path that can leave the worktree: absolute, from `~`, through `..`, or whatever a variable holds. */
function leaves(path: string): boolean {
  if (path.startsWith('/') || path === '~' || path.startsWith('~/') || path.includes('$')) return true;
  return path.split('/').includes('..');
}

function deletesOutside(words: readonly string[]): boolean {
  const program = programOf(words);
  if (deleters.has(program)) return words.slice(1).some((word) => !word.startsWith('-') && leaves(word));
  if (program !== 'find' || !words.includes('-delete')) return false;
  // find's paths come before its first test (`-name`…); none means `.`.
  const paths: string[] = [];
  for (const word of words.slice(1)) {
    if (word.startsWith('-')) break;
    paths.push(word);
  }
  return paths.some(leaves);
}

const plainWord = /^[A-Za-z0-9_@%+=:,./-]+$/;

/** The words as one line the reader reads back the same way: a word with spaces or quotes in single quotes. */
function lineOf(words: readonly string[]): string {
  return words.map((word) => (plainWord.test(word) ? word : `'${word.replaceAll("'", String.raw`'\''`)}'`)).join(' ');
}

/** What Always allow saves for one command (Q4): the program and its first word that isn't an option, and the script after `run`. */
function entryOf(words: readonly string[]): string {
  const program = programOf(words);
  const rest = words.slice(1).filter((word) => !word.startsWith('-'));
  const first = rest[0];
  if (first === undefined) return program;
  const second = rest[1];
  return lineOf(first === 'run' && second !== undefined ? [program, first, second] : [program, first]);
}

export function readCommand(line: string): CommandReading {
  const parts = scan(line);
  if (parts === null) return opaque;
  if (parts.some(pushes)) return { kind: 'push' };
  // A command the reader can't follow runs only in the sandbox, so it's never promoted to one that runs outside it.
  if (parts.some(unfollowed)) return opaque;
  if (url.test(line) || parts.some(reachesNetwork)) return { kind: 'always_asks', reason: 'network' };
  if (parts.some(deletesOutside)) return { kind: 'always_asks', reason: 'delete_outside' };
  const only = parts.length === 1 ? parts[0] : undefined;
  return { kind: 'command', parts, entry: only === undefined ? null : entryOf(only) };
}

/**
 * One entry for the allow list (Q8f), as Settings and Always allow save it: one command the reader can
 * follow, written back a single space apart.
 */
export const AllowedCommandSchema = z
  .string()
  .trim()
  .min(1, 'Enter a command.')
  .transform((line, ctx) => {
    const read = readCommand(line);
    const only = read.kind === 'command' && read.parts.length === 1 ? read.parts[0] : undefined;
    if (only !== undefined) return lineOf(only);
    ctx.addIssue(
      read.kind === 'command'
        ? 'Add one command at a time, without &&, ; or |.'
        : `${line} always asks, so it can't go on the list.`,
    );
    return z.NEVER;
  });
export type AllowedCommand = z.infer<typeof AllowedCommandSchema>;
