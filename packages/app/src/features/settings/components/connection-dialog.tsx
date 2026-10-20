import { useId, useState, type ReactNode } from 'react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import type { IntegrationId, IntegrationStatus } from '@devhub/contracts';
import {
  Button,
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
} from '@devhub/ui';
import { useNow } from '../../../words/use-now.ts';
import { useGitHubConnection, useJiraConnection } from '../queries.ts';
import { githubWrites, lastCheckedText, leadLine, lookOf, lookWords, reads, toolNames } from './connection-words.ts';
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
  /** Said politely while the dialog is open: the page's own live region is hidden behind it. */
  said?: string;
}

/**
 * A tool's status button and the dialog it opens (spec 030, 10a): the mark, the name and the state at the
 * top, the state's first line and body, then its buttons. Closing gives focus back to the status button.
 */
function ConnectionDialog({ tool, status, open, onOpenChange, body, foot, said = '' }: ConnectionDialogProps) {
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
        <p role="status" className="sr-only">
          {said}
        </p>
      </DialogContent>
    </Dialog>
  );
}

/** Cancel and Done: nothing to save, so both just close. */
function closeFoot(close: () => void) {
  return (
    <DialogFoot>
      <Button onClick={close}>Cancel</Button>
      <Button variant="primary" onClick={close}>
        Done
      </Button>
    </DialogFoot>
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
  /** Says a message politely; the Connections panel owns the one live region. */
  announce: (message: string) => void;
}

/** Jira's status button and dialog. */
export function JiraConnectionDialog({ status, announce }: ToolDialogProps) {
  const connection = useJiraConnection();
  const [open, setOpen] = useState(false);
  const now = useNow();
  const formId = useId();
  const saved = connection.data?.saved ?? null;

  function close(message?: string) {
    setOpen(false);
    if (message !== undefined) announce(message);
  }

  let body: ReactNode;
  let foot: ReactNode;
  if (lookOf(status) === 'connected') {
    body = (
      <DetailList
        aria-label="Jira details"
        items={[
          ...(saved === null ? [] : [{ term: 'Site', detail: saved.site }]),
          ...(status.account === undefined ? [] : [{ term: 'Account', detail: status.account }]),
          { term: 'Signed in with', detail: 'Personal API token' },
          { term: 'Orynx reads', detail: reads.jira },
          ...(status.checkedAt === undefined
            ? []
            : [{ term: 'Last checked', detail: lastCheckedText(status.checkedAt, now) }]),
        ]}
      />
    );
    foot = closeFoot(() => {
      close();
    });
  } else if (connection.isLoadingError) {
    body = loadFailed();
  } else if (connection.data) {
    body = (
      <JiraConnectionForm
        id={formId}
        connection={connection.data}
        onConnected={() => {
          close('Jira is connected.');
        }}
        onDisconnected={() => {
          close('Jira is disconnected.');
        }}
        onCancel={() => {
          close();
        }}
      />
    );
  }

  return <ConnectionDialog tool="jira" status={status} open={open} onOpenChange={setOpen} body={body} foot={foot} />;
}

/** GitHub's status button and dialog. */
export function GitHubConnectionDialog({ status, announce }: ToolDialogProps) {
  const connection = useGitHubConnection();
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState('');
  const now = useNow();
  const formId = useId();
  const method = connection.data?.saved?.method;

  function close(message?: string) {
    setOpen(false);
    if (message !== undefined) announce(message);
  }

  let body: ReactNode;
  let foot: ReactNode;
  if (lookOf(status) === 'connected') {
    body = (
      <DetailList
        aria-label="GitHub details"
        items={[
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
      />
    );
    foot = closeFoot(() => {
      close();
    });
  } else if (connection.isLoadingError) {
    body = loadFailed();
  } else if (connection.data) {
    body = (
      <GitHubConnectionForm
        id={formId}
        connection={connection.data}
        announce={setSaid}
        onConnected={() => {
          close('GitHub is connected.');
        }}
        onDisconnected={() => {
          close('GitHub is disconnected.');
        }}
        onCancel={() => {
          close();
        }}
      />
    );
  }

  return (
    <ConnectionDialog
      tool="github"
      status={status}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setSaid('');
      }}
      body={body}
      foot={foot}
      said={said}
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
