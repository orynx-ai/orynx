import { z } from 'zod';
import { SessionStepSchema, type SessionStep, type SessionStepItem } from '@devhub/contracts';
import type { AgentAsk, OrynxTool } from '../agents/agent-adapter.ts';

/**
 * Orynx's own tools for a Build session (spec 042), beside its ticket tools on the `orynx` MCP server: Claude changes
 * the session's steps with them. Each checks its input itself; the session decides what a call may do.
 */

export interface SessionToolsContext {
  /** Changes the steps to come and the current one; the reason Orynx refused, or null when it took the change. */
  changeSteps(change: { steps: SessionStepItem[]; current: SessionStep; reason: string }): Promise<string | null>;
  /** What you're asked before a server starts (Q7); null when you always allow servers in this repository. */
  serverAsk(command: string, folder: string): Promise<AgentAsk | null>;
  /**
   * Starts the server in a Terminal tab of its own and waits for it to listen: where it listens, its last lines when
   * nothing did, or why it couldn't start.
   */
  startServer(
    command: string,
    folder: string,
  ): Promise<{ port: number; url: string | null } | { lines: string[] } | { refused: string }>;
}

const StartServerSchema = z.object({
  command: z.string().trim().min(1).max(2_000),
  folder: z.string().trim().min(1).max(500).default('.'),
});

const SetStepsSchema = z.object({
  steps: z.array(z.object({ kind: SessionStepSchema, label: z.string() })),
  current: SessionStepSchema,
  reason: z.string().trim().min(1).max(300),
});

export function sessionTools(context: SessionToolsContext): OrynxTool[] {
  return [
    {
      name: 'set_steps',
      description:
        "Changes the steps Orynx shows the user for this session, when the work changes: a run that needs a fix, a fix that needs no tests. Send the whole list, the step you're on now, and why. Steps done or under way stay as they are. 1 to 5 steps; each has a kind (setup, plan, build, test, run, answer, review, pull_request) and a label of 1 to 3 words, at most 16 characters, starting with a capital, letters and digits only; no two share a label or a kind; pull_request only last. You can't move onto or past a run, answer, review or pull_request step: Orynx and the user move those.",
      input: SetStepsSchema,
      asks: () => Promise.resolve(null),
      async run(input) {
        const change = SetStepsSchema.safeParse(input);
        if (!change.success)
          return { text: "Orynx couldn't read these steps: send steps, current and reason.", error: true };
        const refused = await context.changeSteps(change.data);
        if (refused !== null) return { text: `Orynx didn't change the steps: ${refused}`, error: true };
        return { text: `The steps are now: ${change.data.steps.map((step) => step.label).join(' · ')}.` };
      },
    },
    {
      name: 'start_server',
      description:
        'Starts a server or anything else that keeps running (a dev server, a watcher) in a Terminal tab of its own, in the worktree or a folder inside it, after the user allows it. Use this instead of run_in_background, nohup or &. Answers once it listens on a port, with its address, or after 60 seconds with its last lines. It keeps running after you finish. Pick a free port yourself.',
      input: StartServerSchema,
      async asks(input) {
        const server = StartServerSchema.safeParse(input);
        return server.success ? context.serverAsk(server.data.command, server.data.folder) : null;
      },
      async run(input) {
        const server = StartServerSchema.safeParse(input);
        if (!server.success) return { text: "Orynx couldn't read this server: send its command.", error: true };
        const started = await context.startServer(server.data.command, server.data.folder);
        if ('refused' in started) return { text: started.refused, error: true };
        if ('lines' in started) {
          return {
            text: `Nothing listened within 60 seconds. Its last lines:\n${started.lines.join('\n')}`,
            error: true,
          };
        }
        const at = started.url ?? `localhost:${String(started.port)}`;
        return {
          text: `It listens on ${at}, in its own Terminal tab. It keeps running after you finish; stop it with stop_server.`,
        };
      },
    },
  ];
}
