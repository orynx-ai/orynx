import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@devhub/api-client';
import type { ServerEvent } from '@devhub/contracts';
import { useApi } from './api.tsx';

/** Which cached queries each server event makes stale. Add a case when you add an event. */
function keysFor(event: ServerEvent): readonly (readonly string[])[] {
  switch (event.type) {
    case 'hello':
      return [];
    case 'status.changed':
      // Connecting or disconnecting a tool also changes its saved settings (specs 003 and 004), and which
      // tools the inbox shows (spec 007).
      return [
        queryKeys.status,
        queryKeys.jiraConnection,
        queryKeys.githubConnection,
        queryKeys.inbox,
        queryKeys.tickets,
      ];
    case 'sessions.changed':
      // A session waiting for approval is a row on Home (spec 007), and a ticket's agent chip (spec 008).
      return [queryKeys.sessions, queryKeys.inbox, queryKeys.tickets];
    case 'settings.changed':
      // The inbox rules apply when the server reads the list (spec 007).
      return [queryKeys.preferences, queryKeys.repositories, queryKeys.inbox];
    case 'inbox.changed':
      // A sync ended: Tickets' sprint syncs with the inbox (spec 008).
      return [queryKeys.inbox, queryKeys.tickets];
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
