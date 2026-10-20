import type { Session, Terminal, TerminalTab } from '@devhub/contracts';
import { Button, Pill, Skeleton, TerminalView } from '@devhub/ui';
import { useShellTab } from '../../queries.ts';
import { shellTabName, terminalWords } from './terminal-words.ts';

/** Whose shell tabs: a session's, or Home's under `homeTerminalId`, which has no branch. */
type ShellsOf = Pick<Session, 'id' | 'branch'>;

/** The meta line over a shell tab: whose shell, the branch, and where it runs (Q8h). */
function ShellMeta({ session, worktree }: { session: ShellsOf; worktree: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2 text-label text-muted-foreground">
      <Pill tone="warning">{terminalWords.yourShell}</Pill>
      {session.branch === null ? null : <Pill plain>{session.branch}</Pill>}
      {worktree === null ? null : (
        <span title={worktree} className="min-w-0 truncate font-mono">
          {worktree}
        </span>
      )}
    </div>
  );
}

/** Your shell tab before the server has said what's in it: the terminal's place held, or why it couldn't say. */
export function ShellTabPending({
  session,
  failed,
  onRetry,
}: {
  session: ShellsOf;
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
 * One of your shell tabs (spec 038): a real terminal on your login shell, started in the session's worktree. What
 * you type goes straight to the shell, so prompts, ⌃C, full-screen programs and `cd` work as anywhere else; it
 * scrolls back through what the shell printed. `takeFocus` puts your keys in it once it's drawn: on opening, and
 * after + or Close.
 */
export function ShellTab({
  session,
  terminal,
  tab,
  takeFocus,
}: {
  session: ShellsOf;
  terminal: Terminal;
  tab: TerminalTab;
  takeFocus: boolean;
}) {
  const shell = useShellTab(session.id, tab.id);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ShellMeta session={session} worktree={terminal.worktree} />
      <TerminalView
        label={shellTabName(terminal.shell, tab.number, session.id)}
        takeFocus={takeFocus}
        connect={shell.connect}
        onData={shell.send}
        onResize={shell.resize}
        className="flex-1"
      />
      {shell.failed ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-t border-border px-3.5 py-2 text-small">
          <span className="text-danger">{terminalWords.unreachable}</span>
          <Button size="sm" variant="secondary" onClick={shell.retry}>
            {terminalWords.tryAgain}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
