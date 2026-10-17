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
      // Connecting or disconnecting a tool also changes its saved settings (specs 003 and 004).
      return [queryKeys.status, queryKeys.jiraConnection, queryKeys.githubConnection];
    case 'sessions.changed':
      return [queryKeys.sessions];
    case 'settings.changed':
      return [queryKeys.preferences, queryKeys.repositories];
    case 'inbox.changed':
      // Nothing reads the inbox yet; spec 007's api-client task gives it a query key.
      return [];
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
