import { z } from 'zod';
import { mostMessageCharacters, RefusalReasonSchema } from './session.ts';

/**
 * The session's Terminal (spec 036): a read-only tab of the commands Claude ran, and your own shell tabs, which
 * run one command per block in the session's worktree.
 */

/** What Orynx keeps: shell tabs per session, blocks per tab, lines per block; Claude's lines; what Ask Claude to fix sends. */
export const terminalLimits = { tabs: 5, blocks: 100, lines: 2000, claudeLines: 200, fixLines: 50 } as const;

/** A command as typed: something to run, no longer than a follow-up may be. */
const CommandTextSchema = z.string().regex(/\S/, 'a command needs something to run').max(mostMessageCharacters);

/** Output as lines, colour codes removed; `cut` when older lines were dropped to keep the last ones. */
const OutputFields = { output: z.array(z.string()), cut: z.boolean() };

const ClaudeCommandBaseSchema = z.object({ id: z.string().min(1), command: CommandTextSchema });

/**
 * One of Claude's commands in the Claude tab, oldest first. `ms` runs from the moment the command was allowed.
 * Claude Code gives no exit code, so an ended one is only `done` or `failed`. `stopped` never ended: Claude's run
 * did first (Stop, a problem, Orynx closing). `note` is Ask Claude to fix's line, "Sent from your terminal", with
 * your command.
 */
export const ClaudeCommandSchema = z.discriminatedUnion('state', [
  ClaudeCommandBaseSchema.extend({ state: z.literal('running') }),
  ClaudeCommandBaseSchema.extend({ state: z.literal('done'), ...OutputFields, ms: z.int().nonnegative() }),
  ClaudeCommandBaseSchema.extend({ state: z.literal('failed'), ...OutputFields, ms: z.int().nonnegative() }),
  ClaudeCommandBaseSchema.extend({ state: z.literal('stopped') }),
  ClaudeCommandBaseSchema.extend({ state: z.literal('denied') }),
  ClaudeCommandBaseSchema.extend({ state: z.literal('refused'), reason: RefusalReasonSchema }),
  ClaudeCommandBaseSchema.extend({ state: z.literal('note') }),
]);
export type ClaudeCommand = z.infer<typeof ClaudeCommandSchema>;

/** GET /api/sessions/:id/commands. A command waiting for your answer is in the session's `approvals`. */
export const ClaudeCommandListSchema = z.object({ commands: z.array(ClaudeCommandSchema) });
export type ClaudeCommandList = z.infer<typeof ClaudeCommandListSchema>;

const TerminalBlockBaseSchema = z.object({ id: z.string().min(1), command: CommandTextSchema });

/**
 * One command you ran. `exitCode` is the shell's: 128 plus the signal's number for one that Stop ended.
 * `no_worktree` ran nothing, because the worktree wasn't there (AC-25).
 */
export const TerminalBlockSchema = z.discriminatedUnion('state', [
  TerminalBlockBaseSchema.extend({ state: z.literal('running'), ...OutputFields }),
  TerminalBlockBaseSchema.extend({ state: z.literal('done'), ...OutputFields, ms: z.int().nonnegative() }),
  TerminalBlockBaseSchema.extend({
    state: z.literal('failed'),
    ...OutputFields,
    exitCode: z.int().positive(),
    ms: z.int().nonnegative(),
  }),
  TerminalBlockBaseSchema.extend({ state: z.literal('no_worktree') }),
]);
export type TerminalBlock = z.infer<typeof TerminalBlockSchema>;

/** A shell tab: `number` 1 is the first, which can't be closed. `cleared` once you emptied it. */
export const TerminalTabSchema = z.object({
  id: z.string().min(1),
  number: z.int().positive(),
  blocks: z.array(TerminalBlockSchema),
  cleared: z.boolean(),
});
export type TerminalTab = z.infer<typeof TerminalTabSchema>;

/** GET /api/sessions/:id/terminal: your shell tabs, oldest first. */
export const TerminalSchema = z.object({
  /** Your login shell's name, which the tabs are named after: "zsh". */
  shell: z.string().min(1),
  /** The worktree as the meta line shows it, with `~` for your home. */
  worktree: z.string().min(1),
  tabs: z.array(TerminalTabSchema).min(1),
  /** The commands you ran in this session, oldest first, for ↑ and ↓. */
  history: z.array(CommandTextSchema),
});
export type Terminal = z.infer<typeof TerminalSchema>;

/** POST /api/sessions/:id/terminal/tabs. */
export const AddTerminalTabAnswerSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('added'), tabId: z.string().min(1) }),
  /** There are `terminalLimits.tabs` already. */
  z.object({ result: z.literal('full') }),
]);
export type AddTerminalTabAnswer = z.infer<typeof AddTerminalTabAnswerSchema>;

/** POST /api/sessions/:id/terminal/tabs/:tabId/commands. */
export const RunCommandRequestSchema = z.object({ command: CommandTextSchema });
export type RunCommandRequest = z.infer<typeof RunCommandRequestSchema>;

export const RunCommandAnswerSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('started'), blockId: z.string().min(1) }),
  /** A command runs in this tab already: one at a time. */
  z.object({ result: z.literal('busy') }),
]);
export type RunCommandAnswer = z.infer<typeof RunCommandAnswerSchema>;
