import { z } from 'zod';
import {
  BranchFromSchema,
  SessionIntentSchema,
  SessionStepSchema,
  SessionStepsSchema,
  stepsOf,
  type BranchFrom,
  type SessionIntent,
  type SessionStepItem,
  type SessionWorkOn,
} from '@devhub/contracts';
import { titleFrom } from './composer-names.ts';
import type { BranchHints } from './worktrees.ts';

/**
 * The quick read of your ask (spec 042, Q1): one call with no tools, on the model you picked, before the worktree. Its
 * answer is only a suggestion: every field is checked here, and anything that fails gives way to Orynx's own.
 */

export interface AskInput {
  message: string;
  /** One line per chip: a ticket's key, type and summary; a pull request's number, title and branch; a file's name. */
  chips: readonly string[];
  folder: string;
  /** Null when the folder's branches couldn't be read. */
  hints: BranchHints | null;
  /** From `readBranchRules`: "" when the repository has none. */
  rules: string;
  /** The session's ticket, whose key every branch name must hold. */
  ticketKey: string | null;
  workOn: SessionWorkOn;
  /** Orynx's own name, for when the read gives none or one it can't use. */
  fallbackBranch: string;
}

export interface AskReading {
  intent: SessionIntent;
  title: string;
  /** Where the worktree starts, `origin/<name>`; null for the default when the folder has no `origin`. */
  base: string | null;
  /** A branch you named that isn't on `origin`. */
  missingBase: string | null;
  branch: string;
  branchFrom: BranchFrom;
  /** What the read suggested when Orynx couldn't use it. */
  suggested: string | null;
  branchNote: 'unusable' | 'taken' | null;
  steps: SessionStepItem[];
}

/** The most characters a branch name may have (spec 042). */
const mostBranchCharacters = 60;

const AnswerSchema = z.object({
  intent: SessionIntentSchema,
  title: z.string().trim().min(1),
  branch: z.string().trim().min(1).nullable(),
  branchFrom: BranchFromSchema.nullable(),
  base: z.string().trim().min(1).nullable(),
  // Checked by the rules after, so a bad list falls back to the intent's own instead of failing the read.
  steps: z.array(z.object({ kind: SessionStepSchema, label: z.string() })),
});

export const readingInstructions = `You read a developer's ask before a coding session starts. You have no tools. Answer with one JSON object and nothing else:
{"intent": "change" | "run" | "answer", "title": string, "branch": string | null, "branchFrom": "message" | "repo_rules" | "your_branches" | "orynx" | null, "base": string | null, "steps": [{"kind": string, "label": string}]}

- intent: "change" when the ask needs code edited; "run" when it asks to start, pull, install, migrate, seed or run tests without changing code; "answer" when it asks to explain, find or review.
- title: what the session does, at most 80 characters, in plain words.
- base: the branch to start from when the ask names one ("latest develop" is "develop"), else null.
- branch: the name for a branch, used only if the session edits code. Take the first that applies: a name the ask gives ("message"); the repository's written rules ("repo_rules"); the shape of the developer's own recent branches ("your_branches"); else "feat/", "fix/" or "chore/" and three to five words ("orynx"). Say what the work is, not how it was asked. At most 60 characters. When a ticket key is given, the name must hold it.
- steps: 1 to 5 steps the session will go through, in order. Each has a kind from setup, plan, build, test, run, answer, review, pull_request, and a label of 1 to 3 words, at most 16 characters, starting with a capital, letters and digits only. No two steps share a label or a kind. pull_request can only be last; use it only for a change. A run usually is setup then run; a question is one answer step; a change usually is plan, build, test, review, pull_request.`;

function listed(names: readonly string[]): string {
  return names.length === 0 ? 'none' : names.join(', ');
}

/** What Claude is sent: the ask and the names around it, never a file's contents. */
export function readingPrompt(input: AskInput): string {
  const base = input.hints?.base.replace(/^origin\//, '');
  return [
    `The ask:\n${input.message === '' ? '(none: the ticket is the ask)' : input.message}`,
    ...(input.chips.length === 0 ? [] : [`Added to it:\n${input.chips.map((chip) => `- ${chip}`).join('\n')}`]),
    `Folder: ${input.folder}`,
    ...(input.hints === null
      ? []
      : [
          `Default branch: ${base ?? 'unknown'}`,
          `Branches on origin, newest first: ${listed(input.hints.origin)}`,
          `The developer's own recent branches: ${listed(input.hints.yours)}`,
        ]),
    ...(input.ticketKey === null ? [] : [`The branch name must hold ${input.ticketKey}.`]),
    input.rules === ''
      ? "The repository's rules for branch names: none written."
      : `The repository's rules for branch names:\n${input.rules}`,
  ].join('\n\n');
}

/** Close to `git check-ref-format --branch`, and short enough to read (spec 042, AC-21). */
function usableBranch(name: string, ticketKey: string | null): boolean {
  return (
    name.length <= mostBranchCharacters &&
    /^[A-Za-z0-9._/-]+$/.test(name) &&
    !/^[-/.]|[/.]$|\.\.|\/\/|\/\.|\.lock(?:\/|$)/.test(name) &&
    (ticketKey === null || name.toLowerCase().includes(ticketKey.toLowerCase()))
  );
}

/** The steps an intent starts with (spec 042), and today's five when the read failed. */
export function defaultSteps(intent: SessionIntent | null, workOn: SessionWorkOn): SessionStepItem[] {
  if (intent === 'run')
    return [
      { kind: 'setup', label: 'Set up' },
      { kind: 'run', label: 'Run' },
    ];
  if (intent === 'answer') return [{ kind: 'answer', label: 'Answer' }];
  return stepsOf({ steps: [], workOn });
}

/** Claude's answer, checked; null when it isn't the JSON asked for. */
export function readingFrom(text: string, input: AskInput): AskReading | null {
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  let parsed: z.infer<typeof AnswerSchema>;
  try {
    const answer = AnswerSchema.safeParse(JSON.parse(json));
    if (!answer.success) return null;
    parsed = answer.data;
  } catch {
    return null;
  }

  const asked = parsed.base?.replace(/^origin\//, '') ?? null;
  const known = asked !== null && input.hints?.origin.includes(asked) === true;
  const base = input.hints === null ? null : asked !== null && known ? `origin/${asked}` : input.hints.base;

  const named = parsed.branch !== null && parsed.branchFrom !== null;
  const usable = named && usableBranch(parsed.branch ?? '', input.ticketKey);
  // A pull request's words are Orynx's, so they match the page bar's button (spec 042, Q5).
  const pullLabel = input.workOn === 'pull_request' ? 'Push' : 'Pull request';
  const steps = SessionStepsSchema.safeParse(
    parsed.steps.map((step) => (step.kind === 'pull_request' ? { ...step, label: pullLabel } : step)),
  );
  return {
    intent: parsed.intent,
    title: titleFrom(parsed.title),
    base,
    missingBase: asked !== null && input.hints !== null && !known ? asked : null,
    branch: usable ? (parsed.branch ?? input.fallbackBranch) : input.fallbackBranch,
    branchFrom: usable ? (parsed.branchFrom ?? 'orynx') : 'orynx',
    suggested: named && !usable ? parsed.branch : null,
    branchNote: named && !usable ? 'unusable' : null,
    steps: steps.success ? steps.data : defaultSteps(parsed.intent, input.workOn),
  };
}
