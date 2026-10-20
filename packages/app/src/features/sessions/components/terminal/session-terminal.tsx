import { useEffect, useRef, useState, type RefObject } from 'react';
import { ComputerTerminal01Icon } from '@hugeicons/core-free-icons';
import { useQuery } from '@tanstack/react-query';
import { sessionTerminalQueryOptions } from '@devhub/api-client';
import type { Session } from '@devhub/contracts';
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
import { useApi } from '../../../../api.tsx';
import { usePlatform } from '../../../../platform.tsx';
import { terminalShortcut } from '../../../../shell/shortcuts.ts';
import { useWide } from '../../../../shell/use-wide.ts';
import { useTerminalTabs } from '../../store.ts';
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
  const api = useApi();
  const terminal = useQuery(sessionTerminalQueryOptions(api, session.id));
  const picked = useTerminalTabs((state) => state.picked[session.id]);
  const pick = useTerminalTabs((state) => state.pick);
  const shellTabs = terminal.data?.tabs ?? [];
  // Your shell the first time, or once the tab you had has closed (AC-1).
  const tab =
    picked === 'claude' || shellTabs.some((shellTab) => shellTab.id === picked)
      ? picked
      : (shellTabs[0]?.id ?? 'tab-1');
  const waiting = session.approvals.length > 0;
  const key = session.source?.kind === 'jira' ? session.source.key : null;
  const about = key === null ? session.title : `${session.title} · ${key}`;

  return (
    <DialogContent
      size="full"
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
              {waiting ? <Pill tone="warning">{terminalWords.needsYou}</Pill> : null}
            </TabsTrigger>
            {terminal.data === undefined
              ? null
              : shellTabs.map((shellTab) => (
                  <TabsTrigger key={shellTab.id} value={shellTab.id}>
                    {shellTabName(terminal.data.shell, shellTab.number)}
                  </TabsTrigger>
                ))}
          </TabsList>
        </div>
        <TabsContent value="claude" className="min-h-0 flex-1" />
        {shellTabs.map((shellTab) => (
          <TabsContent key={shellTab.id} value={shellTab.id} className="min-h-0 flex-1" />
        ))}
      </Tabs>
    </DialogContent>
  );
}
