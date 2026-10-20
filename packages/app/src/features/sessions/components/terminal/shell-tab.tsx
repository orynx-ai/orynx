import { useEffect, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  mostMessageCharacters,
  terminalLimits,
  type Session,
  type Terminal,
  type TerminalBlock,
  type TerminalTab,
} from '@devhub/contracts';
import { Button, CommandBlock, CommandInput, CopyButton, Pill, Skeleton, type CommandBlockProps } from '@devhub/ui';
import { useTerminalActions } from '../../queries.ts';
import { commandFormSchema, type CommandFormValues } from '../../schemas.ts';
import { busyPlaceholder, copyWhat, cutNote, statusWords, terminalWords } from './terminal-words.ts';

type Actions = ReturnType<typeof useTerminalActions>;

/** How one of your commands shows: its status, output, and what you can do with it. */
function blockOf(block: TerminalBlock, tabId: string, actions: Actions): Omit<CommandBlockProps, 'command'> {
  if (block.state === 'no_worktree') {
    return { status: '✗', tone: 'danger', children: <span>{terminalWords.noWorktree}</span> };
  }
  const shown = { output: block.output, ...(block.cut ? { note: cutNote(terminalLimits.lines) } : {}) };
  if (block.state === 'running') {
    return {
      ...shown,
      status: statusWords.running,
      tone: 'warning',
      actions: (
        <Button
          size="sm"
          variant="secondary"
          aria-label={`${terminalWords.stop} ${block.command}`}
          onClick={() => {
            actions.stop.mutate(tabId);
          }}
        >
          {terminalWords.stop}
        </Button>
      ),
    };
  }
  return {
    ...shown,
    status: block.state === 'done' ? statusWords.done(block.ms) : statusWords.failed(block.ms, block.exitCode),
    tone: block.state === 'done' ? 'success' : 'danger',
    actions: (
      <>
        <Button
          size="sm"
          variant="secondary"
          aria-label={`${terminalWords.rerun} ${block.command}`}
          onClick={() => {
            actions.run.mutate({ tabId, command: block.command });
          }}
        >
          {terminalWords.rerun}
        </Button>
        <CopyButton
          text={[block.command, ...block.output].join('\n')}
          what={copyWhat(block.command)}
          label={terminalWords.copy}
        />
      </>
    ),
  };
}

/** The meta line over a shell tab: whose shell, the branch, and where it runs (Q8h). */
function ShellMeta({ session, worktree }: { session: Session; worktree: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2 text-label text-muted-foreground">
      <Pill tone="warning">{terminalWords.yourShell}</Pill>
      {session.branch === null ? null : <Pill plain>{session.branch}</Pill>}
      {worktree === null ? null : <span className="font-mono">{worktree}</span>}
    </div>
  );
}

/** Your shell tab before the server has said what's in it: the blocks' place held, or why it couldn't say. */
export function ShellTabPending({
  session,
  failed,
  onRetry,
}: {
  session: Session;
  failed: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ShellMeta session={session} worktree={null} />
      <div
        role="log"
        aria-label={terminalWords.shellLog}
        aria-busy={!failed}
        className="flex min-h-0 flex-1 flex-col gap-2.5 px-3.5 py-2.5"
      >
        {failed ? (
          <div className="flex flex-wrap items-center gap-2 text-small">
            <span>{terminalWords.unreachable}</span>
            <Button size="sm" variant="secondary" onClick={onRetry}>
              {terminalWords.tryAgain}
            </Button>
          </div>
        ) : (
          <>
            <Skeleton className="h-20 w-full rounded-md" />
            <Skeleton className="h-20 w-full rounded-md" />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * One of your shell tabs (spec 036, AC-4 to AC-16, AC-25, AC-26): what you ran in it, oldest first, and the command
 * line. A command runs in your login shell from the worktree, one at a time; while one runs, the field says so and
 * ⌃C stops it. `focusField` asks the field to take focus once it's drawn: on opening, and after + or Close.
 */
export function ShellTab({
  session,
  terminal,
  tab,
  focusField,
  onFieldFocused,
}: {
  session: Session;
  terminal: Terminal;
  tab: TerminalTab;
  focusField: boolean;
  onFieldFocused: () => void;
}) {
  const actions = useTerminalActions(session.id);
  const form = useForm<CommandFormValues, unknown, { command: string }>({
    resolver: zodResolver(commandFormSchema),
    defaultValues: { command: '' },
  });
  const field = form.register('command');
  const input = useRef<HTMLInputElement | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const last = tab.blocks.at(-1);
  const running = last?.state === 'running' ? last : undefined;
  const lines = last !== undefined && last.state !== 'no_worktree' ? last.output.length : 0;
  // The command that couldn't be sent, which Try again sends again (AC-26).
  const unsent = actions.run.isError ? actions.run.variables : undefined;

  useEffect(() => {
    if (!focusField) return;
    input.current?.focus();
    onFieldFocused();
  }, [focusField, onFieldFocused]);

  // The newest output is at the bottom, so the log keeps it in view, as a terminal does.
  useEffect(() => {
    const element = log.current;
    if (element !== null) element.scrollTop = element.scrollHeight;
  }, [tab.blocks.length, lines]);

  /** Runs a command; from the field, it empties once the command has started. */
  const run = (command: string) => {
    actions.run.mutate(
      { tabId: tab.id, command },
      {
        onSuccess: (answer) => {
          if (answer.result === 'started' && form.getValues('command').trim() === command) form.reset({ command: '' });
        },
      },
    );
  };
  const submit = form.handleSubmit(({ command }) => {
    // `clear` empties the tab, as in a terminal; it isn't a command to run.
    if (command === 'clear') {
      actions.clear.mutate(tab.id, {
        onSuccess: () => {
          form.reset({ command: '' });
        },
      });
      return;
    }
    run(command);
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ShellMeta session={session} worktree={terminal.worktree} />
      <div
        ref={log}
        role="log"
        aria-live="polite"
        aria-label={terminalWords.shellLog}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region must take keyboard focus (WCAG 2.1.1)
        tabIndex={0}
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 py-2.5 focus-visible:-outline-offset-2"
      >
        {tab.blocks.length === 0 ? (
          <p className="text-small text-muted-foreground">
            {tab.cleared ? terminalWords.cleared : terminalWords.emptyTab}
          </p>
        ) : null}
        {tab.blocks.map((block) => (
          <CommandBlock key={block.id} command={block.command} {...blockOf(block, tab.id, actions)} />
        ))}
      </div>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        {unsent === undefined ? null : (
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-3.5 py-2 text-small">
            <span className="text-danger">{terminalWords.unreachable}</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                run(unsent.command);
              }}
            >
              {terminalWords.tryAgain}
            </Button>
          </div>
        )}
        <CommandInput
          label={terminalWords.command}
          hint={terminalWords.hint}
          history={terminal.history}
          placeholder={running === undefined ? terminalWords.placeholder : busyPlaceholder(running.command)}
          maxLength={mostMessageCharacters}
          {...field}
          ref={(element) => {
            field.ref(element);
            input.current = element;
          }}
          onRecall={(command) => {
            form.setValue('command', command);
          }}
          onInterrupt={() => {
            if (running !== undefined) actions.stop.mutate(tab.id);
          }}
        />
      </form>
    </div>
  );
}
