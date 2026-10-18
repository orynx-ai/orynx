import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { PlusSignIcon, SparklesIcon } from '@hugeicons/core-free-icons';
import { Link, useNavigate } from '@tanstack/react-router';
import type { CannotStartReason, StartSessionAnswer } from '@devhub/contracts';
import {
  Button,
  Icon,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  WorkItemShip,
} from '@devhub/ui';
import { useApi } from '../../../api.tsx';
import { FolderDialog } from '../../settings/components/folder-dialog.tsx';
import { useRepositories, useStatus } from '../../settings/queries.ts';
import { useSessions } from '../queries.ts';

/** At most this many sessions work at once (spec 011, Q11); the server says the same. */
const mostWorking = 3;

/**
 * Where Ship sits: the sparkle on a Tickets card, the list's "Ship", or the action on a Home row (spec 020:
 * "Ship" names the action that starts Claude on a ticket, everywhere).
 */
export type ShipLook = 'sparkle' | 'button' | 'row';

type Reason = CannotStartReason | 'failed';

function projectOf(key: string): string {
  return key.slice(0, key.lastIndexOf('-'));
}

/**
 * Ship: start Claude on a ticket (spec 011, AC-1, AC-11, AC-12; named Ship in spec 020). With one folder for the ticket's project, Claude signed in
 * and room for another session, it starts at once and opens the session. Otherwise it opens a menu: the
 * folders under "Start in", or why it can't start and where to fix it (Q4). The page decides from what it
 * already holds; the server checks again and has the last word. The menu ends in Add local folder, which
 * opens Settings' folder dialog with the ticket's project picked, then starts Claude in the new folder
 * (spec 020, AC-22 to AC-24).
 */
export function ShipWithClaude({ ticketKey, look }: { ticketKey: string; look: ShipLook }) {
  const api = useApi();
  const navigate = useNavigate();
  const status = useStatus();
  const repositories = useRepositories();
  const sessions = useSessions();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  // Add local folder opens the dialog once the menu has closed and let go of focus.
  const addAfterClose = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const project = projectOf(ticketKey);

  const start = useMutation({
    mutationFn: (repositoryId?: string) =>
      api.startSession({ ticketKey, ...(repositoryId === undefined ? {} : { repositoryId }) }),
    onSuccess: (answer: StartSessionAnswer) => {
      if (answer.result === 'cannot_start' || answer.result === 'context_failed') {
        setOpen(true);
        return;
      }
      setOpen(false);
      void navigate({ to: '/sessions/$sessionId', params: { sessionId: answer.sessionId } });
    },
    onError: () => {
      setOpen(true);
    },
  });

  const folders = (repositories.data?.repositories ?? []).filter((folder) => folder.jiraProject === project);
  const working = (sessions.data?.sessions ?? []).filter(
    (session) => session.state === 'working' || session.state === 'needs_you',
  ).length;
  // What the page knows; while any of it is still loading, Ship starts and the server decides.
  const known = status.isSuccess && repositories.isSuccess && sessions.isSuccess;
  const ahead: Reason | null = !known
    ? null
    : !status.data.agent.connected
      ? 'signed_out'
      : working >= mostWorking
        ? 'too_many'
        : folders.length === 0
          ? 'no_folder'
          : folders.length > 1
            ? 'choose_folder'
            : null;
  // Ship sends no chips (spec 015), so none can fail; if one ever did, it reads as any failed start.
  const answered: Reason | null =
    start.isError || start.data?.result === 'context_failed'
      ? 'failed'
      : start.data?.result === 'cannot_start'
        ? start.data.reason
        : null;
  const reason = answered ?? ahead;
  const name = `Ship ${ticketKey}`;

  function changeOpen(next: boolean) {
    if (!next) {
      setOpen(false);
      start.reset();
      return;
    }
    if (start.isPending) return;
    if (reason === null) {
      start.mutate(undefined);
      return;
    }
    setOpen(true);
  }

  const trigger =
    look === 'sparkle' ? (
      <WorkItemShip ref={button} itemKey={ticketKey} pending={start.isPending} />
    ) : look === 'button' ? (
      <Button ref={button} variant="ghost" size="sm" pending={start.isPending} aria-label={name}>
        Ship
      </Button>
    ) : (
      // A Home row's icon, beside Open in Jira (spec 020).
      <IconButton ref={button} variant="ghost" size="sm" label="Ship" aria-label={name} pending={start.isPending}>
        <Icon icon={SparklesIcon} aria-hidden />
      </IconButton>
    );

  const addFolder = (
    <MenuItem
      icon={<Icon icon={PlusSignIcon} />}
      onSelect={() => {
        addAfterClose.current = true;
      }}
    >
      Add local folder
    </MenuItem>
  );

  function openDialogAfterClose(event: Event) {
    if (!addAfterClose.current) return;
    addAfterClose.current = false;
    event.preventDefault();
    setAdding(true);
  }

  return (
    <>
      <Menu open={open} onOpenChange={changeOpen}>
        <MenuTrigger asChild>{trigger}</MenuTrigger>
        {reason === 'choose_folder' ? (
          <MenuContent heading="Start in" align="end" onCloseAutoFocus={openDialogAfterClose}>
            {folders.map((folder) => (
              <MenuItem
                key={folder.id}
                path={folder.displayPath}
                onSelect={() => {
                  start.mutate(folder.id);
                }}
              >
                {folder.name}
              </MenuItem>
            ))}
            <MenuSeparator />
            {addFolder}
          </MenuContent>
        ) : (
          <MenuContent aria-label={name} align="end" onCloseAutoFocus={openDialogAfterClose}>
            {reason === 'no_folder' ? (
              <>
                <MenuLabel>No folder is set for {project}.</MenuLabel>
                {addFolder}
              </>
            ) : (
              <ReasonItems reason={reason} />
            )}
          </MenuContent>
        )}
      </Menu>
      <FolderDialog
        task={adding ? { kind: 'add', jiraProject: project } : null}
        returnFocusTo={() => button.current}
        onClose={() => {
          setAdding(false);
        }}
        onSaved={(folder) => {
          setAdding(false);
          // The quick path: Claude starts on the ticket in the folder just added (AC-23).
          start.mutate(folder.id);
        }}
      />
    </>
  );
}

/** Why Ship can't start, and the link that fixes it when there is one (Q10d). No folder has its own items. */
function ReasonItems({ reason }: { reason: Reason | null }) {
  switch (reason) {
    case 'signed_out':
      return (
        <>
          <MenuLabel>Claude Code isn&apos;t signed in.</MenuLabel>
          <MenuItem asChild>
            <Link to="/settings/$tab" params={{ tab: 'coding-agent' }}>
              Open Settings › Coding agent
            </Link>
          </MenuItem>
        </>
      );
    case 'too_many':
      // A menu needs an item, so the line is one nobody can pick.
      return <MenuItem disabled>Three sessions are already working. Stop one to start another.</MenuItem>;
    case 'failed':
      return <MenuItem disabled>See the terminal for details.</MenuItem>;
    default:
      return null;
  }
}
