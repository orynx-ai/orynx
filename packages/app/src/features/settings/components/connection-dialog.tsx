import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Cancel01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import type { IntegrationId, IntegrationStatus } from '@devhub/contracts';
import {
  Button,
  Callout,
  CalloutCode,
  CopyButton,
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
import { githubReconnectSchema, jiraReconnectSchema } from '../schemas.ts';
import {
  useCheckConnection,
  useConnectGitHub,
  useConnectJira,
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
import { GitHubConnectionForm, newTokenUrl } from './github-connection-form.tsx';
import { apiTokensUrl, JiraConnectionForm } from './jira-connection-form.tsx';
import { ReconnectTokenForm } from './reconnect-token-form.tsx';

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
   * The dialog's one live region, under the body: the page's own is hidden behind the dialog. Holds a
   * check's progress or answer, or words for a screen reader only.
   */
  live?: ReactNode;
}

/**
 * A tool's status button and the dialog it opens (spec 030, 10a): the mark, the name and the state at the
 * top, the state's first line and body, then its buttons. Closing gives focus back to the status button.
 */
function ConnectionDialog({ tool, status, open, onOpenChange, body, foot, live }: ConnectionDialogProps) {
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
          {/* There from the start, so a screen reader hears what arrives in it. */}
          <p role="status" className="m-0 text-small empty:hidden">
            {live}
          </p>
        </div>
        {foot}
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
  /** Reconnecting means signing gh in again, not a new token: GitHub through gh. */
  throughGh: boolean;
  /** Reconnecting with a new token: the field, once what it sends with has arrived. `done` shuts the dialog. */
  tokenForm: ((id: string, done: () => void) => ReactNode) | undefined;
  /** The saved settings the form starts from could not be loaded. */
  loadFailed: boolean;
  /**
   * The connect form with this `id`, which Connect submits, once what it starts from has arrived. `close`
   * shuts the dialog, saying `message`.
   */
  form: ((id: string, close: (message?: string) => void, announce: (message: string) => void) => ReactNode) | undefined;
  /** Connect and Reconnect with a token: the button waits while it is on its way. */
  connect: { isPending: boolean; reset: () => void };
  disconnect: ReturnType<typeof useDisconnectJira>;
  /** What Disconnect takes away, and what it leaves. */
  disconnectText: string;
  /** Said under it, if anything. */
  disconnectNote?: ReactNode;
}

const ghLogin = 'gh auth login';

/** A tool Orynx can connect itself: Jira or GitHub. */
function ManagedDialog({
  tool,
  status,
  announce,
  details,
  throughGh,
  tokenForm,
  loadFailed: failedToLoad,
  form,
  connect,
  disconnect,
  disconnectText: goes,
  disconnectNote,
}: ManagedDialogProps) {
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState('');
  const [confirming, setConfirming] = useState(false);
  const check = useCheckConnection(tool);
  const name = toolNames[tool];
  const look = lookOf(status);
  const formId = useId();

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
    // A fresh start each time it opens. A check or a disconnect still on its way keeps its answer: closing
    // doesn't stop it, and it lands in the row and the page's line.
    if (next && !check.isPending) check.reset();
    if (next && !connect.isPending) connect.reset();
    if (next && !disconnect.isPending) disconnect.reset();
  }
  function close(message?: string) {
    onOpenChange(false);
    if (message !== undefined) announce(message);
  }
  function reconnect() {
    check.mutate(undefined, {
      onSuccess: ({ status: answer }) => {
        if (answer.state === 'connected') close(changedLine.reconnected(name));
      },
    });
  }

  const passed = check.data?.status.state === 'connected' ? check.data.ms : undefined;
  const failed = check.data?.status.state === 'error' ? (check.data.status.detail ?? undefined) : undefined;
  const checkError = check.error ? (
    <p role="alert" className="m-0 text-small text-danger">
      {check.error.message}
    </p>
  ) : null;
  const cancel = (
    <Button
      onClick={() => {
        close();
      }}
    >
      Cancel
    </Button>
  );
  const askToDisconnect = (
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
  );

  let body: ReactNode;
  let foot: ReactNode;
  let live: ReactNode = null;
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
  } else if (look === 'connected') {
    body = (
      <>
        <DetailList aria-label={`${name} details`} items={details} />
        {checkError}
      </>
    );
    live =
      passed === undefined ? null : (
        <span className="flex items-center gap-2 text-success">
          <Icon icon={Tick02Icon} />
          {testedLine(name, passed)}
        </span>
      );
    foot = (
      <DialogFoot start={askToDisconnect}>
        {passed === undefined ? cancel : null}
        <Button
          pending={check.isPending}
          onClick={() => {
            check.mutate();
          }}
        >
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
  } else if (look === 'needs_reconnecting' && throughGh) {
    const reason = failed ?? status.detail ?? `Orynx can no longer reach ${name}.`;
    body = (
      <>
        {/* Red, and said at once, when a check from this dialog just failed (spec 030, AC-9 and AC-18). */}
        <Callout
          key={reason}
          tone={failed === undefined ? 'warning' : 'danger'}
          role={failed === undefined ? undefined : 'alert'}
          title={reason}
        >
          <span className="text-small">Run this in a terminal, then press Reconnect:</span>
          <div className="flex items-center gap-2">
            <CalloutCode className="min-w-0 flex-1">{ghLogin}</CalloutCode>
            <CopyButton text={ghLogin} label="Copy command" />
          </div>
        </Callout>
        {status.account === undefined ? null : (
          <DetailList aria-label={`${name} details`} items={[{ term: 'Account', detail: status.account }]} />
        )}
        {checkError}
      </>
    );
    live = check.isPending ? <span className="text-muted-foreground">Checking your gh login…</span> : null;
    foot = (
      <DialogFoot start={askToDisconnect}>
        {cancel}
        <Button variant="primary" pending={check.isPending} onClick={reconnect}>
          Reconnect
        </Button>
      </DialogFoot>
    );
  } else if (look === 'needs_reconnecting' && tokenForm) {
    const reason = failed ?? status.detail ?? `Orynx can no longer reach ${name}.`;
    body = (
      <Callout
        key={reason}
        tone={failed === undefined ? 'warning' : 'danger'}
        role={failed === undefined ? undefined : 'alert'}
        title={reason}
      >
        {tokenForm(formId, () => {
          close(changedLine.reconnected(name));
        })}
      </Callout>
    );
    foot = (
      <DialogFoot start={askToDisconnect}>
        {cancel}
        <Button type="submit" form={formId} variant="primary" pending={connect.isPending}>
          Reconnect
        </Button>
      </DialogFoot>
    );
  } else {
    body = (
      <>
        {failed === undefined ? null : <Callout key={failed} tone="danger" role="alert" title={failed} />}
        {failedToLoad ? loadFailed() : form?.(formId, close, setSaid)}
      </>
    );
    live = said === '' ? null : <span className="sr-only">{said}</span>;
    foot = (
      <DialogFoot>
        {cancel}
        {form === undefined ? null : (
          <Button type="submit" form={formId} variant="primary" pending={connect.isPending}>
            Connect
          </Button>
        )}
      </DialogFoot>
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
      live={live}
    />
  );
}

/** Jira's status button and dialog. */
export function JiraConnectionDialog({ status, announce }: ToolDialogProps) {
  const connection = useJiraConnection();
  const connect = useConnectJira();
  const disconnect = useDisconnectJira();
  const now = useNow();
  const loaded = connection.data;
  const saved = loaded?.saved ?? null;
  return (
    <ManagedDialog
      tool="jira"
      status={status}
      announce={announce}
      throughGh={false}
      tokenForm={
        saved === null
          ? undefined
          : (id, done) => (
              <ReconnectTokenForm
                id={id}
                label="API token"
                schema={jiraReconnectSchema}
                createUrl={apiTokensUrl}
                createLabel="Create an API token"
                send={(apiToken) => connect.mutateAsync({ ...saved, ...(apiToken === undefined ? {} : { apiToken }) })}
                onReconnected={done}
              />
            )
      }
      connect={connect}
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
          ? (id, close) => (
              <JiraConnectionForm
                id={id}
                connection={loaded}
                connect={connect}
                onConnected={() => {
                  close(changedLine.connected('Jira'));
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
  const connect = useConnectGitHub();
  const disconnect = useDisconnectGitHub();
  const now = useNow();
  const loaded = connection.data;
  const method = loaded?.saved?.method;
  return (
    <ManagedDialog
      tool="github"
      status={status}
      announce={announce}
      throughGh={method === 'gh'}
      tokenForm={
        method === 'token'
          ? (id, done) => (
              <ReconnectTokenForm
                id={id}
                label="Personal access token"
                schema={githubReconnectSchema}
                createUrl={newTokenUrl}
                createLabel="Create a token"
                send={(token) => connect.mutateAsync({ method: 'token', ...(token === undefined ? {} : { token }) })}
                onReconnected={done}
              />
            )
          : undefined
      }
      connect={connect}
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
          ? (id, close, say) => (
              <GitHubConnectionForm
                id={id}
                connection={loaded}
                connect={connect}
                announce={say}
                onConnected={() => {
                  close(changedLine.connected('GitHub'));
                }}
              />
            )
          : undefined
      }
    />
  );
}

/** What step 1 copies for a Slack admin (spec 030, Q4). */
export const slackRequest =
  'Could you approve the Orynx app in our Slack workspace? It needs search:read, channels:history and im:history, only for my account, so Orynx can show my mentions and DMs. It runs on my computer.';

/**
 * Slack's status button and dialog: the first of its two steps, asking the admin. Pasting the token, the
 * second, comes with spec 016 (spec 030, Q4).
 */
export function SlackConnectionDialog({ status }: Pick<ToolDialogProps, 'status'>) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <ConnectionDialog
      tool="slack"
      status={status}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setCopied(false);
      }}
      body={
        <div className="flex flex-col items-start gap-1.5">
          <span className="font-medium">Ask your Slack admin to approve the Orynx app</span>
          <span className="text-small text-muted-foreground">
            It needs search:read, channels:history and im:history, only for your account.
          </span>
          <Button
            size="sm"
            className="mt-1"
            onClick={() => {
              // A copy the browser refuses changes nothing.
              void navigator.clipboard.writeText(slackRequest).then(
                () => {
                  setCopied(true);
                },
                () => undefined,
              );
            }}
          >
            {copied ? 'Request copied' : 'Copy request for your admin'}
          </Button>
        </div>
      }
      foot={
        <DialogFoot>
          {/* Cancel, as 10a draws it: the head's Close already has that name. */}
          <Button
            onClick={() => {
              setOpen(false);
            }}
          >
            Cancel
          </Button>
        </DialogFoot>
      }
    />
  );
}
