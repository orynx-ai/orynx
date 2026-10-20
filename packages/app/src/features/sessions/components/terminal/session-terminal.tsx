import { useEffect, useImperativeHandle, useState, type Ref, type RefObject } from 'react';
import { Cancel01Icon, ComputerTerminal01Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { homeTerminalId, terminalLimits, type Session } from '@devhub/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Icon,
  IconButton,
  Pill,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@devhub/ui';
import { usePlatform } from '../../../../platform.tsx';
import { terminalShortcut } from '../../../../shell/shortcuts.ts';
import { useSessionTerminal, useTerminalActions } from '../../queries.ts';
import { useTerminalTabs } from '../../store.ts';
import { ClaudeTab } from './claude-tab.tsx';
import { ShellTab, ShellTabPending } from './shell-tab.tsx';
import { shellTabName, terminalWords } from './terminal-words.ts';

/**
 * The session's Terminal (spec 036, spec 038): Terminal in More actions, or `⌃`` anywhere on the Session screen,
 * opens a dialog that fills the window. Close, Esc outside your shell, or `⌃`` again close it, and focus goes back
 * to `returnTo`, More actions. Only a session whose Terminal opens has one (AC-3). With no session it is Home's
 * Terminal: your shell tabs in Orynx's home folder, without the Claude tab.
 */
export function SessionTerminal({
  session,
  returnTo,
  ref,
}: {
  session: Session | null;
  returnTo: RefObject<HTMLButtonElement | null>;
  /** Opens the dialog, for the menu's item. */
  ref: Ref<{ open: () => void }>;
}) {
  const platform = usePlatform();
  const shortcut = terminalShortcut(platform);
  const [open, setOpen] = useState(false);
  useImperativeHandle(ref, () => ({
    open: () => {
      setOpen(true);
    },
  }));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!shortcut.matches(event)) return;
      event.preventDefault();
      // A held key repeats; only the first press counts.
      if (!event.repeat) setOpen((was) => !was);
    };
    // Capture phase, so the field or the terminal you're typing in can't swallow it.
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [shortcut]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open ? (
        <TerminalDialog
          session={session}
          returnTo={returnTo}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </Dialog>
  );
}

function TerminalDialog({
  session,
  returnTo,
  onClose,
}: {
  session: Session | null;
  returnTo: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const shells = session ?? { id: homeTerminalId, branch: null };
  const terminal = useSessionTerminal(shells.id);
  const actions = useTerminalActions(shells.id);
  const picked = useTerminalTabs((state) => state.picked[shells.id]);
  const pick = useTerminalTabs((state) => state.pick);
  // Your shell takes your keys once it's drawn: on opening on your shell, after +, and after a tab closes. Not on
  // picking a tab, so the arrow keys go on moving along the tabs.
  const [focusShell, setFocusShell] = useState(picked !== 'claude');
  const shellTabs = terminal.data?.tabs ?? [];
  // Your shell the first time, or once the tab you had has closed (AC-1).
  const tab =
    (picked === 'claude' && session !== null) || shellTabs.some((shellTab) => shellTab.id === picked)
      ? picked
      : (shellTabs[0]?.id ?? 'tab-1');
  const shellTab = shellTabs.find((one) => one.id === tab);
  const waiting = session !== null && session.approvals.length > 0;
  const key = session?.source?.kind === 'jira' ? session.source.key : null;
  const about =
    session === null ? terminalWords.home.about : key === null ? session.title : `${session.title} · ${key}`;
  const full = shellTabs.length >= terminalLimits.tabs;

  /** Picks a tab the server has just made or kept, once the tabs have been read again. */
  const pickOnceRead = async (next: string) => {
    await terminal.refetch();
    pick(shells.id, next);
    setFocusShell(true);
  };

  return (
    <DialogContent
      size="full"
      onOpenAutoFocus={(event) => {
        // Into the dialog, not onto Close; your shell takes focus once it's drawn, maybe before this.
        event.preventDefault();
        const dialog = event.currentTarget;
        if (dialog instanceof HTMLElement && !dialog.contains(document.activeElement)) dialog.focus();
      }}
      onEscapeKeyDown={(event) => {
        // Esc in your shell is the shell's (vim, a prompt); the shell's input is the dialog's only textarea.
        if (event.target instanceof HTMLTextAreaElement) event.preventDefault();
      }}
      onCloseAutoFocus={(event) => {
        // Back to More actions, however it was opened: ⌃` leaves no trigger for Radix to go back to.
        event.preventDefault();
        returnTo.current?.focus();
      }}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border py-1.5 ps-4 pe-2.5">
        <Icon icon={ComputerTerminal01Icon} aria-hidden />
        <DialogTitle className="text-body">{terminalWords.title}</DialogTitle>
        <span title={about} className="min-w-0 flex-1 basis-24 truncate text-small text-muted-foreground">
          {about}
        </span>
        {waiting && tab !== 'claude' ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              pick(shells.id, 'claude');
            }}
          >
            {terminalWords.claudeNeedsYou}
          </Button>
        ) : null}
        <IconButton variant="ghost" size="sm" label={terminalWords.closeTerminal} onClick={onClose}>
          <Icon icon={Cancel01Icon} aria-hidden />
        </IconButton>
      </div>
      <Tabs
        value={tab}
        onValueChange={(next) => {
          pick(shells.id, next);
          setFocusShell(false);
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex shrink-0 items-center gap-1 border-b border-border bg-sidebar px-3">
          <TabsList aria-label={terminalWords.tabs} className="min-w-0 flex-1 gap-5 border-b-0">
            {session === null ? null : (
              <TabsTrigger value="claude">
                {terminalWords.claude}
                {waiting ? (
                  <>
                    {' '}
                    <Pill tone="warning">{terminalWords.needsYou}</Pill>
                  </>
                ) : null}
              </TabsTrigger>
            )}
            {terminal.data === undefined
              ? null
              : shellTabs.map((one) => (
                  <TabsTrigger key={one.id} value={one.id}>
                    {shellTabName(terminal.data.shell, one.number, shells.id)}
                  </TabsTrigger>
                ))}
          </TabsList>
          {terminal.data === undefined ? null : (
            <IconButton
              variant="ghost"
              size="sm"
              // Not disabled, so its tooltip can say why it does nothing (AC-10).
              label={
                session === null
                  ? full
                    ? terminalWords.home.tabsFull
                    : terminalWords.home.newTab
                  : full
                    ? terminalWords.tabsFull
                    : terminalWords.newTab
              }
              aria-disabled={full || undefined}
              onClick={() => {
                if (full || actions.add.isPending) return;
                actions.add.mutate(undefined, {
                  onSuccess: (answer) => {
                    if (answer.result === 'added') void pickOnceRead(answer.tabId);
                  },
                });
              }}
            >
              <Icon icon={PlusSignIcon} aria-hidden />
            </IconButton>
          )}
          {shellTab === undefined || shellTab.number === 1 || terminal.data === undefined ? null : (
            <IconButton
              variant="ghost"
              size="sm"
              label={`${terminalWords.close} ${shellTabName(terminal.data.shell, shellTab.number, shells.id)}`}
              onClick={() => {
                const before = shellTabs[shellTabs.indexOf(shellTab) - 1]?.id ?? 'tab-1';
                actions.close.mutate(shellTab.id, {
                  onSuccess: () => {
                    void pickOnceRead(before);
                  },
                });
              }}
            >
              <Icon icon={Cancel01Icon} aria-hidden />
            </IconButton>
          )}
        </div>
        {session === null ? null : (
          <TabsContent value="claude" className="min-h-0 flex-1">
            <ClaudeTab session={session} />
          </TabsContent>
        )}
        {tab !== 'claude' && terminal.data === undefined ? (
          <ShellTabPending
            session={shells}
            failed={terminal.isError}
            onRetry={() => {
              void terminal.refetch();
            }}
          />
        ) : null}
        {terminal.data === undefined
          ? null
          : shellTabs.map((one) => (
              <TabsContent key={one.id} value={one.id} className="min-h-0 flex-1">
                <ShellTab session={shells} terminal={terminal.data} tab={one} takeFocus={focusShell} />
              </TabsContent>
            ))}
      </Tabs>
    </DialogContent>
  );
}
