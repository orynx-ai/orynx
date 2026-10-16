import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { formatFinding } from '../lib/gate.ts';
import { checkDesignNote, isScreenFile } from '../lib/policies/design-source.ts';
import { isProtected } from '../lib/policies/protected-files.ts';
import { findStyleViolations, inStyleScope } from '../lib/policies/style.ts';
import { repoRoot, toRepoPath } from '../lib/repo.ts';
import { ALLOW, block, isMain, runHook, type Decision, type HookInput } from './hook-io.ts';

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const MAX_SHOWN = 10;

/** Blocks writes to protected files, style-policy violations an edit adds, and screens without a Design note. */
export function decideFileTool(input: HookInput, root: string): Decision {
  const tool = input.tool_name ?? '';
  const ti = input.tool_input ?? {};
  if (!FILE_TOOLS.has(tool) || ti.file_path === undefined) return ALLOW;
  const path = toRepoPath(ti.file_path, root);
  if (path === null) return ALLOW;

  const protection = isProtected(path);
  if (protection.protected) return block(`✖ Blocked: ${protection.reason}`);

  if (inStyleScope(path)) {
    let findings;
    if (tool === 'Write') {
      findings = findStyleViolations(path, ti.content ?? '');
    } else {
      // Only what this edit adds: a violation already in old_string is not the edit's fault.
      const pairs = tool === 'Edit' ? [{ old_string: ti.old_string, new_string: ti.new_string }] : (ti.edits ?? []);
      findings = pairs.flatMap((pair) => {
        const before = new Map<string, number>();
        for (const f of findStyleViolations(path, pair.old_string ?? '', { snippet: true })) {
          before.set(f.message, (before.get(f.message) ?? 0) + 1);
        }
        return findStyleViolations(path, pair.new_string ?? '', { snippet: true }).filter((f) => {
          const left = before.get(f.message) ?? 0;
          if (left > 0) {
            before.set(f.message, left - 1);
            return false;
          }
          return true;
        });
      });
    }
    if (findings.length > 0) {
      const shown = findings.slice(0, MAX_SHOWN).map(formatFinding).join('\n');
      const more = findings.length > MAX_SHOWN ? `\n  …and ${findings.length - MAX_SHOWN} more` : '';
      return block(
        `✖ style-policy: this ${tool} adds values that are not DevHub tokens (docs/design-map.md):\n${shown}${more}`,
      );
    }
  }

  if (tool === 'Write' && isScreenFile(path)) {
    const note = checkDesignNote(path, ti.content ?? '');
    if (note.finding) return block(`✖ design-source: ${note.finding.message}\n    fix: ${note.finding.fix}`);
  }
  return ALLOW;
}

/** Removes quoted text so flags inside a commit message are not mistaken for real flags. */
function stripQuoted(command: string): string {
  return command.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, (m) => ' '.repeat(m.length));
}

function unquote(token: string): string {
  return token.replace(/^['"]|['"]$/g, '');
}

function segments(command: string): string[][] {
  return command
    .split(/&&|\|\||[;|\n]/)
    .map((segment) =>
      segment
        .trim()
        .split(/\s+/)
        .filter((t) => t.length > 0)
        .map(unquote),
    )
    .filter((tokens) => tokens.length > 0);
}

const REDIRECT = /(?:^|[^<>&\d])&?>{1,2}\s*([^\s;&|]+)/g;

/**
 * Blocks commands that skip checks, rewrite history, wipe the user's home, or write protected files.
 * Paths in the command resolve against `cwd`, then are checked relative to the repo `root`.
 */
export function decideBash(command: string, cwd: string, root: string, home: string = homedir()): Decision {
  const repoPathOf = (token: string): string | null => toRepoPath(resolve(cwd, token), root);
  const bare = stripQuoted(command);

  if (/(^|\s)--no-verify(\s|=|$)/.test(bare)) {
    return block(
      '✖ Blocked: --no-verify skips the git hooks (format, secrets, gates). Fix what the hook reports instead.',
    );
  }
  if (/\bgit\s+commit\b[^;&|]*\s-[a-zA-Z]*n[a-zA-Z]*(\s|$)/.test(bare)) {
    return block('✖ Blocked: `git commit -n` skips the pre-commit hook. Commit without -n and fix what it reports.');
  }
  if (/\bgit\s+push\b[^;&|]*(\s--force(-with-lease|-if-includes)?\b|\s-[a-zA-Z]*f[a-zA-Z]*(\s|$)|\s\+\S)/.test(bare)) {
    return block('✖ Blocked: force-push rewrites shared history. Push normally; a person decides on anything else.');
  }
  if (/\bgit\s+reset\s+--hard\s+(origin|@\{u)/.test(bare)) {
    return block('✖ Blocked: `git reset --hard origin/…` throws away local work. Ask a person first.');
  }

  const homeTargets = new Set([
    '~',
    '$HOME',
    '${HOME}',
    '~/.devhub',
    '$HOME/.devhub',
    '${HOME}/.devhub',
    '/',
    home,
    `${home}/.devhub`,
  ]);
  for (const tokens of segments(command)) {
    const args = tokens[0] === 'sudo' ? tokens.slice(1) : tokens;
    const [cmd, ...rest] = args;
    const flags = rest.filter((t) => t.startsWith('-'));
    const operands = rest.filter((t) => !t.startsWith('-'));
    const isProtectedArg = (t: string): boolean => {
      const repoPath = repoPathOf(t);
      return repoPath !== null && isProtected(repoPath).protected;
    };

    if (cmd === 'rm' && flags.some((f) => /^-[a-zA-Z]*[rR]/.test(f) || f === '--recursive')) {
      const hit = operands.find((t) => homeTargets.has(t.replace(/\/\*?$/, '').replace(/\/$/, '') || t));
      if (hit !== undefined)
        return block(
          `✖ Blocked: \`rm -r ${hit}\` would delete the user's home or DevHub data (~/.devhub). Ask a person.`,
        );
    }

    const protectedOperand = (list: readonly string[]): string | undefined => list.find(isProtectedArg);
    let target: string | undefined;
    if (cmd === 'sed' && flags.some((f) => f.startsWith('-i') || f === '--in-place'))
      target = protectedOperand(operands);
    else if (cmd === 'tee' || cmd === 'truncate' || cmd === 'rm' || cmd === 'mv') target = protectedOperand(operands);
    else if (cmd === 'cp')
      target =
        operands.length > 0 && isProtectedArg(operands[operands.length - 1] ?? '')
          ? operands[operands.length - 1]
          : undefined;
    if (target !== undefined) {
      const repoPath = repoPathOf(target) ?? target;
      return block(`✖ Blocked: \`${cmd}\` would change ${isProtected(repoPath).reason}`);
    }
  }

  for (const m of bare.matchAll(REDIRECT)) {
    const repoPath = repoPathOf(unquote(m[1] ?? ''));
    if (repoPath !== null && isProtected(repoPath).protected) {
      return block(`✖ Blocked: redirecting into ${isProtected(repoPath).reason}`);
    }
  }
  return ALLOW;
}

export function decide(input: HookInput, root: string = repoRoot): Decision {
  if (input.tool_name === 'Bash') return decideBash(input.tool_input?.command ?? '', input.cwd ?? root, root);
  return decideFileTool(input, root);
}

if (isMain(import.meta.url)) await runHook((input) => decide(input));
