import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, sessionChangesQueryKey, sessionQueryKey, sessionTerminalQueryKey } from '@devhub/api-client';
import type { ServerEvent } from '@devhub/contracts';
import { useApi } from './api.tsx';

/** Which cached queries each server event makes stale. Add a case when you add an event. */
function keysFor(event: ServerEvent): readonly (readonly string[])[] {
  switch (event.type) {
    case 'hello':
      return [];
    case 'status.changed':
      // Connecting or disconnecting a tool also changes its saved settings (specs 003 and 004), and which
      // tools the inbox shows (spec 007). A check that found Claude's login changed changes its card (spec 010),
      // and the models Claude offers.
      return [
        queryKeys.status,
        queryKeys.claudeLogin,
        queryKeys.agentModels,
        queryKeys.jiraConnection,
        queryKeys.githubConnection,
        queryKeys.inbox,
        queryKeys.tickets,
        queryKeys.search,
      ];
    case 'sessions.changed':
      // A session waiting for approval is a row on Home (spec 007), a ticket's agent chip (spec 008), and a
      // search result (spec 009). A session working or waiting holds Update back (spec 045, AC-22).
      return [queryKeys.sessions, queryKeys.inbox, queryKeys.tickets, queryKeys.search, queryKeys.updates];
    case 'session.changed':
      // One session's steps changed: only its Session screen refetches (spec 011, AC-4).
      return [sessionQueryKey(event.sessionId)];
    case 'session.files.changed':
      // An edit or a command ended: that session's Changes tab, list and diff, reads again (spec 013, AC-2).
      return [sessionChangesQueryKey(event.sessionId)];
    case 'session.terminal.changed':
      // Output came, a command ended, or a tab came or went: that session's Terminal reads again (spec 036).
      return [sessionTerminalQueryKey(event.sessionId)];
    case 'settings.changed':
      // The inbox rules apply when the server reads the list (spec 007). Settings › Notifications too (spec 029), and
      // the Other agents row (spec 037).
      return [
        queryKeys.preferences,
        queryKeys.repositories,
        queryKeys.inbox,
        queryKeys.notificationSettings,
        queryKeys.agentsAccess,
      ];
    case 'inbox.changed':
      // A sync ended: Tickets' sprint syncs with the inbox (spec 008), and search reads both (spec 009).
      return [queryKeys.inbox, queryKeys.tickets, queryKeys.search];
    case 'tickets.changed':
      // You, another tab or an agent made, changed or deleted an Orynx ticket (spec 037): it's on Tickets and in ⌘K.
      return [queryKeys.tickets, queryKeys.orynxTicket, queryKeys.search];
    case 'skills.changed':
      // Another tab, or this one, added, saved or deleted one of your skills (spec 023, AC-19). The key covers
      // Settings › Skills and the composer's `/` lists, which show your skills too.
      return [queryKeys.skills];
    case 'notifications.changed':
      // One came, was read, or its approval ended: the bell, its panel and the pop-ups read the list again (spec 029).
      return [queryKeys.notifications];
    case 'updates.changed':
      // A check or an update moved on: Settings › About reads it again (spec 045).
      return [queryKeys.updates];
  }
}

/** Keeps TanStack Query fresh from GET /api/events (learn/live-updates.md). Renders nothing. */
export function LiveUpdates() {
  const api = useApi();
  const queryClient = useQueryClient();

  useEffect(
    () =>
      api.subscribe((event) => {
        for (const queryKey of keysFor(event)) {
          // A Settings change on its way refetches when it settles (queries.ts); refetching now could read
          // the server before that change is written and flip the control back for a moment.
          if (event.type === 'settings.changed' && queryClient.isMutating({ mutationKey: queryKey }) > 0) continue;
          void queryClient.invalidateQueries({ queryKey });
        }
      }),
    [api, queryClient],
  );

  return null;
}
