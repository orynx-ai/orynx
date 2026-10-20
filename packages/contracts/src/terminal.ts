import { z } from 'zod';
import { mostMessageCharacters, RefusalReasonSchema } from './session.ts';

/**
 * The session's Terminal (spec 036, spec 038): a read-only tab of the commands Claude ran, and your own shell
 * tabs, each a real terminal on your login shell in the session's worktree.
 */

/** Shell tabs per session; lines kept of each of Claude's commands; the most one input request carries. */
export const terminalLimits = { tabs: 5, claudeLines: 200, inputChars: 65_536 } as const;

/**
 * Home's Terminal: your shell tabs in Orynx's home folder (DEVHUB_HOME), on the session Terminal's routes under this
 * id. Never a session's: theirs are 16 hex characters.
 */
export const homeTerminalId = 'orynx';

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

/** A shell tab: `number` 1 is the first, which can't be closed. */
export const TerminalTabSchema = z.object({ id: z.string().min(1), number: z.int().positive() });
export type TerminalTab = z.infer<typeof TerminalTabSchema>;

/** GET /api/sessions/:id/terminal: your shell tabs, oldest first. */
export const TerminalSchema = z.object({
  /** Your login shell's name, which the tabs are named after: "zsh". */
  shell: z.string().min(1),
  /** The worktree as the meta line shows it, with `~` for your home. */
  worktree: z.string().min(1),
  tabs: z.array(TerminalTabSchema).min(1),
});
export type Terminal = z.infer<typeof TerminalSchema>;

/** POST /api/sessions/:id/terminal/tabs. */
export const AddTerminalTabAnswerSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('added'), tabId: z.string().min(1) }),
  /** There are `terminalLimits.tabs` already. */
  z.object({ result: z.literal('full') }),
]);
export type AddTerminalTabAnswer = z.infer<typeof AddTerminalTabAnswerSchema>;

/** POST /api/sessions/:id/terminal/tabs/:tabId/input: keys you pressed or text you pasted, as the terminal sends them. */
export const TerminalInputSchema = z.object({ data: z.string().min(1).max(terminalLimits.inputChars) });
export type TerminalInput = z.infer<typeof TerminalInputSchema>;

/** POST /api/sessions/:id/terminal/tabs/:tabId/size: the terminal's size in characters, so programs draw to fit. */
export const TerminalSizeSchema = z.object({ cols: z.int().min(2).max(1000), rows: z.int().min(1).max(1000) });
export type TerminalSize = z.infer<typeof TerminalSizeSchema>;

/**
 * One frame of GET /api/sessions/:id/terminal/tabs/:tabId/output, a server-sent event stream: first `replay`,
 * all the output the tab keeps, which the terminal draws from scratch (again after a reconnect); then `data`, as
 * the shell writes it. Both carry the shell's own bytes, colours and all.
 */
export const TerminalOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('replay'), data: z.string() }),
  z.object({ kind: z.literal('data'), data: z.string().min(1) }),
]);
export type TerminalOutput = z.infer<typeof TerminalOutputSchema>;
