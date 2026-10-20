import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Cancel01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import type { IntegrationId, IntegrationStatus } from '@devhub/contracts';
import {
  Button,
  Callout,
  DetailList,
  Dialog,
  DialogContent,
  DialogFoot,
  DialogTitle,
  DialogTrigger,
  Icon,
  IconButton,
  Pill,
  SourceMark,
  StatusButton,
  type DetailListProps,
} from '@devhub/ui';
import { useNow } from '../../../words/use-now.ts';
import {
  useCheckConnection,
  useDisconnectGitHub,
  useDisconnectJira,
  useGitHubConnection,
  useJiraConnection,
  useRunningTicketSessions,
} from '../queries.ts';
import {
  changedLine,
  disconnectText,
  githubWrites,
  lastCheckedText,
  leadLine,
  lookOf,
  lookWords,
  reads,
  runningSessionsLine,
  testedLine,
  toolNames,
} from './connection-words.ts';
import { GitHubConnectionForm } from './github-connection-form.tsx';
import { JiraConnectionForm } from './jira-connection-form.tsx';

interface ConnectionDialogProps {
  tool: IntegrationId;
  status: IntegrationStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the state shows under its first line. */
  body?: ReactNode;
  /** The state's buttons, in a {@link DialogFoot}. */
  foot?: ReactNode;
  /**
   * Said politely while the dialog is open, as the page's own live region is hidden behind it. Left out
   * when the body holds a live region of its own.
   */
  said?: string | undefined;
}

/**
 * A tool's status button and the dialog it opens (spec 030, 10a): the mark, the name and the state at the
 * top, the state's first line and body, then its buttons. Closing gives focus back to the status button.
 */
function ConnectionDialog({ tool, status, open, onOpenChange, body, foot, said }: ConnectionDialogProps) {
  const look = lookOf(status);
  const words = lookWords[look];
  const name = toolNames[tool];
  const leadId = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <StatusButton state={look} label={words.tip} aria-label={`${name}: ${words.label}. Manage connection`} />
      </DialogTrigger>
      <DialogContent
        size="narrow"
        aria-describedby={leadId}
        onOpenAutoFocus={(event) => {
          // The dialog itself, not its Close button: there Close's tooltip would open, and Escape shut that first.
          event.preventDefault();
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
        }}
      >
        <div className="flex items-center gap-3 border-b border-border px-5 pt-4.5 pb-3.5">
          <SourceMark source={tool} size="lg" label="none" />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <DialogTitle>{name}</DialogTitle>
            <Pill tone={words.tone} plain={look === 'not_connected'}>
              {words.label}
            </Pill>
          </div>
          <IconButton
            label="Close"
            variant="ghost"
            size="sm"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            <Icon icon={Cancel01Icon} />
          </IconButton>
        </div>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-4.5">
          <p id={leadId} className="m-0">
            {leadLine(tool, look)}
          </p>
          {body}
        </div>
        {foot}
        {said === undefined ? null : (
          <p role="status" className="sr-only">
            {said}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function loadFailed() {
  return (
    <p role="alert" className="m-0 text-small text-danger">
      Could not reach the Orynx server. Check that Orynx is still running in your terminal, then reload the page.
    </p>
  );
}

export interface ToolDialogProps {
  status: IntegrationStatus;
  /** Says what changed, in the page's line under the list: "Jira disconnected." */
  announce: (message: string) => void;
}

/** Under Disconnect Jira's warning: running sessions on a ticket keep what they have. Asked only while it shows. */
function RunningTicketSessions() {
  const count = useRunningTicketSessions().data ?? 0;
  return count === 0 ? null : <p className="m-0 text-small text-muted-foreground">{runningSessionsLine(count)}</p>;
}

interface ManagedDialogProps extends ToolDialogProps {
  tool: 'jira' | 'github';
  /** What Orynx is using, for Connected. */
  details: DetailListProps['items'];
  /** The saved settings the form starts from could not be loaded. */
  loadFailed: boolean;
  /** The connect form, once what it starts from has arrived. `close` shuts the dialog, saying `message`. */
  form: ((close: (message?: string) => void, announce: (message: string) => void) => ReactNode) | undefined;
  disconnect: ReturnType<typeof useDisconnectJira>;
  /** What Disconnect takes away, and what it leaves. */
  disconnectText: string;
  /** Said under it, if anything. */
  disconnectNote?: ReactNode;
}

/** A tool Orynx can connect itself: Jira or GitHub. */
function ManagedDialog({
  tool,
  status,
  announce,
  details,
  loadFailed: failedToLoad,
  form,
  disconnect,
  disconnectText: goes,
  disconnectNote,
}: ManagedDialogProps) {
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState('');
  const [confirming, setConfirming] = useState(false);
  const check = useCheckConnection(tool);
  const name = toolNames[tool];

  // Focus moves to Keep connected when the warning shows, and back to Disconnect when it goes.
  const keep = useRef<HTMLButtonElement>(null);
  const askAgain = useRef<HTMLButtonElement>(null);
  const warned = useRef(false);
  useEffect(() => {
    if (confirming) {
      warned.current = true;
      keep.current?.focus();
    } else if (warned.current) {
      warned.current = false;
      askAgain.current?.focus();
    }
  }, [confirming]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    setSaid('');
    setConfirming(false);
    // A check or a disconnect still on its way lands in the row all the same.
    if (!next) {
      check.reset();
      disconnect.reset();
    }
  }
  function close(message?: string) {
    onOpenChange(false);
    if (message !== undefined) announce(message);
  }
  function test() {
    setSaid('');
    check.mutate();
  }

  const passed = check.data?.status.state === 'connected' ? check.data.ms : undefined;
  const failed = check.data?.status.state === 'error' ? (check.data.status.detail ?? undefined) : undefined;
  const connected = lookOf(status) === 'connected';
  let body: ReactNode;
  let foot: ReactNode;
  if (confirming) {
    body = (
      <>
        <Callout tone="danger" role="alert" title={`Disconnect ${name}?`}>
          <span className="text-small">{goes}</span>
        </Callout>
        {disconnectNote}
        {disconnect.error ? (
          <p role="alert" className="m-0 text-small text-danger">
            {disconnect.error.message}
          </p>
        ) : null}
      </>
    );
    foot = (
      <DialogFoot>
        <Button
          ref={keep}
          // Once Disconnect is on its way, Keep connected can't stop it.
          aria-disabled={disconnect.isPending || undefined}
          onClick={() => {
            if (disconnect.isPending) return;
            disconnect.reset();
            setConfirming(false);
          }}
        >
          Keep connected
        </Button>
        <Button
          variant="danger"
          pending={disconnect.isPending}
          onClick={() => {
            disconnect.mutate(undefined, {
              onSuccess: () => {
                close(changedLine.disconnected(name));
              },
            });
          }}
        >
          Disconnect
        </Button>
      </DialogFoot>
    );
  } else if (connected) {
    body = (
      <>
        <DetailList aria-label={`${name} details`} items={details} />
        <p role="status" className="m-0 flex items-center gap-2 text-small text-success empty:hidden">
          {passed === undefined ? null : (
            <>
              <Icon icon={Tick02Icon} />
              {testedLine(name, passed)}
            </>
          )}
        </p>
        {check.error ? (
          <p role="alert" className="m-0 text-small text-danger">
            {check.error.message}
          </p>
        ) : null}
      </>
    );
    foot = (
      <DialogFoot
        start={
          <Button
            ref={askAgain}
            variant="danger-ghost"
            onClick={() => {
              check.reset();
              setConfirming(true);
            }}
          >
            Disconnect
          </Button>
        }
      >
        {passed === undefined ? (
          <Button
            onClick={() => {
              close();
            }}
          >
            Cancel
          </Button>
        ) : null}
        <Button pending={check.isPending} onClick={test}>
          {passed === undefined ? 'Test connection' : 'Test again'}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            close();
          }}
        >
          Done
        </Button>
      </DialogFoot>
    );
  } else {
    body = (
      <>
        {failed === undefined ? null : <Callout tone="danger" role="alert" title={failed} />}
        {failedToLoad ? loadFailed() : form?.(close, setSaid)}
      </>
    );
  }

  return (
    <ConnectionDialog
      tool={tool}
      status={status}
      open={open}
      onOpenChange={onOpenChange}
      body={body}
      foot={foot}
      said={connected ? undefined : said}
    />
  );
}

/** Jira's status button and dialog. */
export function JiraConnectionDialog({ status, announce }: ToolDialogProps) {
  const connection = useJiraConnection();
  const disconnect = useDisconnectJira();
  const now = useNow();
  const formId = useId();
  const loaded = connection.data;
  const saved = loaded?.saved ?? null;
  return (
    <ManagedDialog
      tool="jira"
      status={status}
      announce={announce}
      disconnect={disconnect}
      disconnectText={disconnectText.jira}
      disconnectNote={<RunningTicketSessions />}
      loadFailed={connection.isLoadingError}
      details={[
        ...(saved === null ? [] : [{ term: 'Site', detail: saved.site }]),
        ...(status.account === undefined ? [] : [{ term: 'Account', detail: status.account }]),
        { term: 'Signed in with', detail: 'Personal API token' },
        { term: 'Orynx reads', detail: reads.jira },
        ...(status.checkedAt === undefined
          ? []
          : [{ term: 'Last checked', detail: lastCheckedText(status.checkedAt, now) }]),
      ]}
      form={
        loaded
          ? (close) => (
              <JiraConnectionForm
                id={formId}
                connection={loaded}
                onConnected={() => {
                  close(changedLine.connected('Jira'));
                }}
                onDisconnected={() => {
                  close(changedLine.disconnected('Jira'));
                }}
                onCancel={() => {
                  close();
                }}
              />
            )
          : undefined
      }
    />
  );
}

/** GitHub's status button and dialog. */
export function GitHubConnectionDialog({ status, announce }: ToolDialogProps) {
  const connection = useGitHubConnection();
  const disconnect = useDisconnectGitHub();
  const now = useNow();
  const formId = useId();
  const loaded = connection.data;
  const method = loaded?.saved?.method;
  return (
    <ManagedDialog
      tool="github"
      status={status}
      announce={announce}
      disconnect={disconnect}
      disconnectText={disconnectText[method ?? 'gh']}
      loadFailed={connection.isLoadingError}
      details={[
        ...(status.account === undefined ? [] : [{ term: 'Account', detail: status.account }]),
        ...(method === undefined
          ? []
          : [{ term: 'Signed in with', detail: method === 'gh' ? 'gh command-line tool' : 'Personal access token' }]),
        { term: 'Orynx reads', detail: reads.github },
        { term: 'Orynx writes', detail: githubWrites },
        ...(status.checkedAt === undefined
          ? []
          : [{ term: 'Last checked', detail: lastCheckedText(status.checkedAt, now) }]),
      ]}
      form={
        loaded
          ? (close, say) => (
              <GitHubConnectionForm
                id={formId}
                connection={loaded}
                announce={say}
                onConnected={() => {
                  close(changedLine.connected('GitHub'));
                }}
                onDisconnected={() => {
                  close(changedLine.disconnected('GitHub'));
                }}
                onCancel={() => {
                  close();
                }}
              />
            )
          : undefined
      }
    />
  );
}

/** Slack's status button and dialog. Connecting Slack comes with spec 016 (spec 030 Q4). */
export function SlackConnectionDialog({ status }: Pick<ToolDialogProps, 'status'>) {
  const [open, setOpen] = useState(false);
  return (
    <ConnectionDialog
      tool="slack"
      status={status}
      open={open}
      onOpenChange={setOpen}
      foot={
        <DialogFoot>
          <Button
            onClick={() => {
              setOpen(false);
            }}
          >
            Close
          </Button>
        </DialogFoot>
      }
    />
  );
}
