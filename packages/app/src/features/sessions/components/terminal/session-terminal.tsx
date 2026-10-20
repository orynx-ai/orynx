import { useEffect, useRef, useState, type RefObject } from 'react';
import { Cancel01Icon, ComputerTerminal01Icon, Delete02Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { terminalLimits, type Session } from '@devhub/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Icon,
  IconButton,
  Kbd,
  Pill,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@devhub/ui';
import { usePlatform } from '../../../../platform.tsx';
import { terminalShortcut } from '../../../../shell/shortcuts.ts';
import { useWide } from '../../../../shell/use-wide.ts';
import { useSessionTerminal, useTerminalActions } from '../../queries.ts';
import { useTerminalTabs } from '../../store.ts';
import { ClaudeTab } from './claude-tab.tsx';
import { ShellTab, ShellTabPending } from './shell-tab.tsx';
import { shellTabName, terminalWords } from './terminal-words.ts';

/**
 * The session's Terminal (spec 036, `docs/design/screens/terminal.html`): Terminal in the page bar, or `⌃``
 * anywhere on the Session screen, opens a dialog that fills the window. Esc, Back to session or `⌃`` again
 * close it, and focus goes back to Terminal. Only a session whose Terminal opens has one (AC-3).
 */
export function SessionTerminal({ session }: { session: Session }) {
  const platform = usePlatform();
  const wide = useWide();
  const shortcut = terminalShortcut(platform);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!shortcut.matches(event)) return;
      event.preventDefault();
      // A held key repeats; only the first press counts.
      if (!event.repeat) setOpen((was) => !was);
    };
    // Capture phase, so the field you're typing in can't swallow it.
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [shortcut]);

  const openIt = () => {
    setOpen(true);
  };
  return (
    <>
      {wide ? (
        <Button
          ref={button}
          variant="ghost"
          size="sm"
          aria-haspopup="dialog"
          aria-keyshortcuts={shortcut.ariaKeyShortcuts}
          onClick={openIt}
        >
          <Icon icon={ComputerTerminal01Icon} aria-hidden />
          {terminalWords.button}
          <Kbd aria-hidden>{shortcut.label}</Kbd>
        </Button>
      ) : (
        <IconButton
          ref={button}
          variant="ghost"
          size="sm"
          label={`${terminalWords.button} (${shortcut.label})`}
          aria-label={terminalWords.button}
          aria-haspopup="dialog"
          aria-keyshortcuts={shortcut.ariaKeyShortcuts}
          onClick={openIt}
        >
          <Icon icon={ComputerTerminal01Icon} aria-hidden />
        </IconButton>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <TerminalDialog
            session={session}
            returnTo={button}
            onClose={() => {
              setOpen(false);
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function TerminalDialog({
  session,
  returnTo,
  onClose,
}: {
  session: Session;
  returnTo: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const terminal = useSessionTerminal(session.id);
  const actions = useTerminalActions(session.id);
  const picked = useTerminalTabs((state) => state.picked[session.id]);
  const pick = useTerminalTabs((state) => state.pick);
  // Your shell's field takes focus once it's drawn: on opening on your shell, after +, and after a tab closes.
  const [focusField, setFocusField] = useState(picked !== 'claude');
  const shellTabs = terminal.data?.tabs ?? [];
  // Your shell the first time, or once the tab you had has closed (AC-1).
  const tab =
    picked === 'claude' || shellTabs.some((shellTab) => shellTab.id === picked)
      ? picked
      : (shellTabs[0]?.id ?? 'tab-1');
  const shellTab = shellTabs.find((one) => one.id === tab);
  const waiting = session.approvals.length > 0;
  const key = session.source?.kind === 'jira' ? session.source.key : null;
  const about = key === null ? session.title : `${session.title} · ${key}`;
  const full = shellTabs.length >= terminalLimits.tabs;

  /** Picks a tab the server has just made or kept, once the tabs have been read again. */
  const pickOnceRead = async (next: string) => {
    await terminal.refetch();
    pick(session.id, next);
    setFocusField(true);
  };

  return (
    <DialogContent
      size="full"
      onOpenAutoFocus={(event) => {
        // Into the dialog, not onto Back to session; your shell's field takes focus once it's drawn.
        event.preventDefault();
        if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
      }}
      onCloseAutoFocus={(event) => {
        // Back to Terminal, however it was opened: ⌃` leaves no trigger for Radix to go back to.
        event.preventDefault();
        returnTo.current?.focus();
      }}
    >
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border py-1.5 ps-4 pe-2.5">
        <Icon icon={ComputerTerminal01Icon} aria-hidden />
        <DialogTitle className="text-body">{terminalWords.title}</DialogTitle>
        <span title={about} className="min-w-0 flex-1 truncate text-small text-muted-foreground">
          {about}
        </span>
        {waiting && tab !== 'claude' ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              pick(session.id, 'claude');
            }}
          >
            {terminalWords.claudeNeedsYou}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onClose}>
          {terminalWords.back}
          <Kbd aria-hidden className="max-sm:hidden">
            Esc
          </Kbd>
        </Button>
      </div>
      <Tabs
        value={tab}
        onValueChange={(next) => {
          pick(session.id, next);
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex shrink-0 items-center gap-1 border-b border-border bg-sidebar px-3">
          <TabsList aria-label={terminalWords.tabs} className="min-w-0 flex-1 gap-5 border-b-0">
            <TabsTrigger value="claude">
              {terminalWords.claude}
              {waiting ? (
                <>
                  {' '}
                  <Pill tone="warning">{terminalWords.needsYou}</Pill>
                </>
              ) : null}
            </TabsTrigger>
            {terminal.data === undefined
              ? null
              : shellTabs.map((one) => (
                  <TabsTrigger key={one.id} value={one.id}>
                    {shellTabName(terminal.data.shell, one.number)}
                  </TabsTrigger>
                ))}
          </TabsList>
          {terminal.data === undefined ? null : (
            <IconButton
              variant="ghost"
              size="sm"
              // Not disabled, so its tooltip can say why it does nothing (AC-10).
              label={full ? terminalWords.tabsFull : terminalWords.newTab}
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
              label={`${terminalWords.close} ${shellTabName(terminal.data.shell, shellTab.number)}`}
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
          {shellTab === undefined ? null : (
            <IconButton
              variant="ghost"
              size="sm"
              label={terminalWords.clearOutput}
              onClick={() => {
                actions.clear.mutate(shellTab.id);
              }}
            >
              <Icon icon={Delete02Icon} aria-hidden />
            </IconButton>
          )}
        </div>
        <TabsContent value="claude" className="min-h-0 flex-1">
          <ClaudeTab session={session} />
        </TabsContent>
        {tab !== 'claude' && terminal.data === undefined ? (
          <ShellTabPending
            session={session}
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
                <ShellTab
                  session={session}
                  terminal={terminal.data}
                  tab={one}
                  focusField={focusField}
                  onFieldFocused={() => {
                    setFocusField(false);
                  }}
                  onAskedToFix={() => {
                    pick(session.id, 'claude');
                  }}
                />
              </TabsContent>
            ))}
      </Tabs>
    </DialogContent>
  );
}
