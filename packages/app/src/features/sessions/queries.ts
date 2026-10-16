import { useQuery } from '@tanstack/react-query';
import { sessionsQueryOptions } from '@devhub/api-client';
import type { SessionListQuery } from '@devhub/contracts';
import { useApi } from '../../api.tsx';

/** Sessions with the newest activity first. Kept fresh by `sessions.changed` events, not polling. */
export function useSessions(query: SessionListQuery = {}) {
  const api = useApi();
  return useQuery(sessionsQueryOptions(api, query));
}

/** One session from the full list; `data` is null when no session has this id. */
export function useSession(sessionId: string) {
  const api = useApi();
  return useQuery({
    ...sessionsQueryOptions(api),
    select: (list) => list.sessions.find((session) => session.id === sessionId) ?? null,
  });
}
