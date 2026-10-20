import { describe, expect, it } from 'vitest';
import {
  AddTerminalTabAnswerSchema,
  apiRoutes,
  ClaudeCommandListSchema,
  ServerEventSchema,
  SessionSchema,
  TerminalInputSchema,
  TerminalOutputSchema,
  TerminalSchema,
  TerminalSizeSchema,
  terminalLimits,
} from './index.ts';
import { makeClaudeCommands, makeSession, makeTerminal } from './testing.ts';

describe('ClaudeCommandListSchema', () => {
  it('AC-19: holds each command Claude ran, oldest first: done and failed with output and time, running, denied, refused', () => {
    const list = makeClaudeCommands();
    expect(ClaudeCommandListSchema.parse(list)).toEqual(list);
    expect(list.commands.map((command) => command.state)).toEqual(['done', 'failed', 'denied', 'refused', 'running']);
  });

  it('AC-17: holds the note Ask Claude to fix leaves, and a command Claude’s run ended before it did', () => {
    const commands = [
      { id: 'note-1', state: 'note', command: 'pnpm test' },
      { id: 'toolu_9', state: 'stopped', command: 'pnpm build' },
    ];
    expect(ClaudeCommandListSchema.parse({ commands })).toEqual({ commands });
  });

  it('refuses an ended command with no time, or an empty command', () => {
    const [done] = makeClaudeCommands().commands;
    expect(ClaudeCommandListSchema.safeParse({ commands: [{ ...done, ms: undefined }] }).success).toBe(false);
    expect(ClaudeCommandListSchema.safeParse({ commands: [{ ...done, command: '' }] }).success).toBe(false);
  });
});

describe('TerminalSchema', () => {
  it('AC-1 (038): your shell, and its tabs, the first numbered 1', () => {
    const terminal = makeTerminal({
      tabs: [
        { id: 'tab-1', number: 1 },
        { id: 'tab-3', number: 3 },
      ],
    });
    expect(TerminalSchema.parse(terminal)).toEqual(terminal);
  });

  it('refuses a terminal with no tab', () => {
    expect(TerminalSchema.safeParse({ ...makeTerminal(), tabs: [] }).success).toBe(false);
  });
});

describe('a shell tab’s input, size and output (spec 038)', () => {
  it('AC-2: takes keys up to the most one request carries, never none', () => {
    expect(TerminalInputSchema.parse({ data: '\u0003' })).toEqual({ data: '\u0003' });
    expect(TerminalInputSchema.safeParse({ data: '' }).success).toBe(false);
    expect(TerminalInputSchema.safeParse({ data: 'x'.repeat(terminalLimits.inputChars + 1) }).success).toBe(false);
  });

  it('AC-4: takes a size in whole characters', () => {
    expect(TerminalSizeSchema.parse({ cols: 120, rows: 40 })).toEqual({ cols: 120, rows: 40 });
    expect(TerminalSizeSchema.safeParse({ cols: 0, rows: 40 }).success).toBe(false);
    expect(TerminalSizeSchema.safeParse({ cols: 80.5, rows: 24 }).success).toBe(false);
  });

  it('AC-5: output is a replay, maybe empty, then pieces of what the shell wrote', () => {
    expect(TerminalOutputSchema.parse({ kind: 'replay', data: '' })).toEqual({ kind: 'replay', data: '' });
    expect(TerminalOutputSchema.parse({ kind: 'data', data: '\u001b[32mok\u001b[0m' }).kind).toBe('data');
    expect(TerminalOutputSchema.safeParse({ kind: 'data', data: '' }).success).toBe(false);
  });

  it('AC-6: a tab is added, or there are 5 already', () => {
    expect(AddTerminalTabAnswerSchema.parse({ result: 'added', tabId: 'tab-2' })).toBeTruthy();
    expect(AddTerminalTabAnswerSchema.parse({ result: 'full' })).toBeTruthy();
    expect(terminalLimits.tabs).toBe(5);
  });
});

describe('the terminal’s routes and event', () => {
  it('lives under the session, and says a session’s terminal changed by its id only', () => {
    expect(apiRoutes.sessionCommands).toBe('/api/sessions/:id/commands');
    expect(apiRoutes.sessionTerminal).toBe('/api/sessions/:id/terminal');
    expect(apiRoutes.sessionTerminalTabs).toBe('/api/sessions/:id/terminal/tabs');
    expect(apiRoutes.sessionTerminalTab).toBe('/api/sessions/:id/terminal/tabs/:tabId');
    expect(apiRoutes.sessionTerminalOutput).toBe('/api/sessions/:id/terminal/tabs/:tabId/output');
    expect(apiRoutes.sessionTerminalInput).toBe('/api/sessions/:id/terminal/tabs/:tabId/input');
    expect(apiRoutes.sessionTerminalSize).toBe('/api/sessions/:id/terminal/tabs/:tabId/size');
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
