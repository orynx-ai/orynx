import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { CannotStartReason, StartSessionAnswer } from '@devhub/contracts';
import { AttentionAction, Button, Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger, WorkItemShip } from '@devhub/ui';
import { useApi } from '../../../api.tsx';
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
 * already holds; the server checks again and has the last word.
 */
export function ShipWithClaude({ ticketKey, look }: { ticketKey: string; look: ShipLook }) {
  const api = useApi();
  const navigate = useNavigate();
  const status = useStatus();
  const repositories = useRepositories();
  const sessions = useSessions();
  const [open, setOpen] = useState(false);
  const project = projectOf(ticketKey);

  const start = useMutation({
    mutationFn: (repositoryId?: string) =>
      api.startSession({ ticketKey, ...(repositoryId === undefined ? {} : { repositoryId }) }),
    onSuccess: (answer: StartSessionAnswer) => {
      if (answer.result === 'cannot_start') {
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
  const answered: Reason | null = start.isError
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
      <WorkItemShip itemKey={ticketKey} pending={start.isPending} />
    ) : look === 'button' ? (
      <Button variant="ghost" size="sm" pending={start.isPending} aria-label={name}>
        Ship
      </Button>
    ) : (
      <AttentionAction asChild aria-disabled={start.isPending || undefined}>
        <button type="button" aria-label={name}>
          Ship
        </button>
      </AttentionAction>
    );

  return (
    <Menu open={open} onOpenChange={changeOpen}>
      <MenuTrigger asChild>{trigger}</MenuTrigger>
      {reason === 'choose_folder' ? (
        <MenuContent heading="Start in" align="end">
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
        </MenuContent>
      ) : (
        <MenuContent aria-label={name} align="end">
          <ReasonItems reason={reason} project={project} />
        </MenuContent>
      )}
    </Menu>
  );
}

/** Why Ship can't start, and the link that fixes it when there is one (Q10d). */
function ReasonItems({ reason, project }: { reason: Reason | null; project: string }) {
  switch (reason) {
    case 'no_folder':
      return (
        <>
          <MenuLabel>No folder is set for {project}.</MenuLabel>
          <MenuItem asChild>
            <Link to="/settings/$tab" params={{ tab: 'repositories' }}>
              Open Settings › Repositories
            </Link>
          </MenuItem>
        </>
      );
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
