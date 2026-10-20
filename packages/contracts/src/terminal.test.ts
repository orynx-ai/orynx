import { describe, expect, it } from 'vitest';
import {
  AddTerminalTabAnswerSchema,
  apiRoutes,
  ClaudeCommandListSchema,
  RunCommandAnswerSchema,
  RunCommandRequestSchema,
  ServerEventSchema,
  SessionSchema,
  TerminalSchema,
  terminalLimits,
} from './index.ts';
import { makeClaudeCommands, makeSession, makeTerminal, makeTerminalBlock } from './testing.ts';

describe('ClaudeCommandListSchema', () => {
  it('AC-19: holds each command Claude ran, oldest first: done and failed with output and time, running, denied, refused', () => {
    const list = makeClaudeCommands();
    expect(ClaudeCommandListSchema.parse(list)).toEqual(list);
    expect(list.commands.map((command) => command.state)).toEqual(['done', 'failed', 'denied', 'refused', 'running']);
  });

  it('AC-17: holds the note Ask Claude to fix leaves', () => {
    const note = { id: 'note-1', state: 'note', command: 'pnpm test' };
    expect(ClaudeCommandListSchema.parse({ commands: [note] })).toEqual({ commands: [note] });
  });

  it('refuses an ended command with no time, or an empty command', () => {
    const [done] = makeClaudeCommands().commands;
    expect(ClaudeCommandListSchema.safeParse({ commands: [{ ...done, ms: undefined }] }).success).toBe(false);
    expect(ClaudeCommandListSchema.safeParse({ commands: [{ ...done, command: '' }] }).success).toBe(false);
  });
});

describe('TerminalSchema', () => {
  it('AC-4, AC-5, AC-25: your shell, its tabs with their blocks, and the commands you ran for ↑', () => {
    const terminal = makeTerminal({
      tabs: [
        {
          id: 'tab-1',
          number: 1,
          cleared: false,
          blocks: [
            makeTerminalBlock(),
            makeTerminalBlock({ id: 'block-2', state: 'failed', command: 'pnpm test', exitCode: 1, ms: 3100 }),
            { id: 'block-3', state: 'no_worktree', command: 'ls' },
            { id: 'block-4', state: 'running', command: 'pnpm dev', output: ['VITE ready'], cut: false },
          ],
        },
      ],
    });
    expect(TerminalSchema.parse(terminal)).toEqual(terminal);
  });

  it('AC-16: says when a block holds only its last lines', () => {
    const block = makeTerminalBlock({ cut: true });
    expect(
      TerminalSchema.parse(makeTerminal({ tabs: [{ id: 'tab-1', number: 1, cleared: false, blocks: [block] }] })),
    ).toBeTruthy();
  });

  it('refuses a failed block that exited 0, and a terminal with no tab', () => {
    const failed = { ...makeTerminalBlock({ state: 'failed', exitCode: 1 }), exitCode: 0 };
    const tab = { id: 'tab-1', number: 1, cleared: false, blocks: [failed] };
    expect(TerminalSchema.safeParse({ ...makeTerminal(), tabs: [tab] }).success).toBe(false);
    expect(TerminalSchema.safeParse({ ...makeTerminal(), tabs: [] }).success).toBe(false);
  });
});

describe('RunCommandRequestSchema', () => {
  it('AC-4: takes a command with something to run in it, up to the most a follow-up holds', () => {
    expect(RunCommandRequestSchema.parse({ command: 'git status' })).toEqual({ command: 'git status' });
    expect(RunCommandRequestSchema.safeParse({ command: '   ' }).success).toBe(false);
    expect(RunCommandRequestSchema.safeParse({ command: 'x'.repeat(10_001) }).success).toBe(false);
  });

  it('AC-8, AC-10: a run is started or the tab is busy; a tab is added or there are 5 already', () => {
    expect(RunCommandAnswerSchema.parse({ result: 'started', blockId: 'block-1' })).toBeTruthy();
    expect(RunCommandAnswerSchema.parse({ result: 'busy' })).toBeTruthy();
    expect(AddTerminalTabAnswerSchema.parse({ result: 'added', tabId: 'tab-2' })).toBeTruthy();
    expect(AddTerminalTabAnswerSchema.parse({ result: 'full' })).toBeTruthy();
    expect(terminalLimits).toEqual({ tabs: 5, blocks: 100, lines: 2000, claudeLines: 200, fixLines: 50 });
  });
});

describe('the terminal’s routes and event', () => {
  it('lives under the session, and says a session’s terminal changed by its id only', () => {
    expect(apiRoutes.sessionCommands).toBe('/api/sessions/:id/commands');
    expect(apiRoutes.sessionTerminal).toBe('/api/sessions/:id/terminal');
    expect(apiRoutes.sessionTerminalTabs).toBe('/api/sessions/:id/terminal/tabs');
    expect(apiRoutes.sessionTerminalTab).toBe('/api/sessions/:id/terminal/tabs/:tabId');
    expect(apiRoutes.sessionTerminalRun).toBe('/api/sessions/:id/terminal/tabs/:tabId/commands');
    expect(apiRoutes.sessionTerminalStop).toBe('/api/sessions/:id/terminal/tabs/:tabId/stop');
    expect(apiRoutes.sessionTerminalBlocks).toBe('/api/sessions/:id/terminal/tabs/:tabId/blocks');
    expect(apiRoutes.sessionTerminalFix).toBe('/api/sessions/:id/terminal/tabs/:tabId/blocks/:blockId/fix');
    const event = { type: 'session.terminal.changed', sessionId: 'session-1' };
    expect(ServerEventSchema.parse(event)).toEqual(event);
  });
});

describe('SessionSchema.terminal', () => {
  it('AC-3: says whether the Terminal opens on this session; a session saved before spec 036 has none', () => {
    expect(makeSession().terminal).toBe(false);
    expect(SessionSchema.parse({ ...makeSession(), terminal: true }).terminal).toBe(true);
  });
});
