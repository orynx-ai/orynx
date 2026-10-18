import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiRequestError, sessionQueryKey, sessionsQueryOptions } from '@devhub/api-client';
import type { ApprovalDecision, Session, SessionListQuery } from '@devhub/contracts';
import { useApi } from '../../api.tsx';

/** Sessions with the newest activity first. Kept fresh by `sessions.changed` events, not polling. */
export function useSessions(query: SessionListQuery = {}) {
  const api = useApi();
  return useQuery(sessionsQueryOptions(api, query));
}

/**
 * One session, as the Session screen shows it (spec 011); `data` is null when no session has this id. Kept
 * fresh by `session.changed` for its steps and `sessions.changed` for its state.
 */
export function useSession(sessionId: string) {
  const api = useApi();
  return useQuery({
    queryKey: sessionQueryKey(sessionId),
    queryFn: async (): Promise<Session | null> => {
      try {
        return await api.session(sessionId);
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === 'not_found') return null;
        throw error;
      }
    },
    // Freshness comes from the event stream, not from polling.
    staleTime: Infinity,
  });
}

/**
 * Your answer to a call waiting in a session (spec 012). The session changes on the server, which says so
 * with `session.changed` and `sessions.changed`, so nothing here touches the cache.
 */
export function useRespondToApproval(sessionId: string) {
  const api = useApi();
  return useMutation({
    mutationFn: ({ approvalId, decision }: { approvalId: string; decision: ApprovalDecision }) =>
      api.respondToApproval(sessionId, approvalId, decision),
  });
}
