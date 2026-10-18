import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ApiRequestError,
  preferencesQueryOptions,
  sessionChangesQueryOptions,
  sessionDiffQueryOptions,
  sessionQueryKey,
  sessionsQueryOptions,
} from '@devhub/api-client';
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

/** What changed in the session's worktree (spec 013): kept fresh by `session.files.changed` and window focus. */
export function useSessionChanges(sessionId: string) {
  const api = useApi();
  return useQuery(sessionChangesQueryOptions(api, sessionId));
}

/** One changed file's diff; nothing is read until there's a file to show. */
export function useSessionDiff(sessionId: string, path: string | null) {
  const api = useApi();
  return useQuery({ ...sessionDiffQueryOptions(api, sessionId, path ?? ''), enabled: path !== null });
}

/** The editor Open in uses, from Settings › Coding agent (spec 013, Q9). */
export function useEditor() {
  const api = useApi();
  return useQuery({ ...preferencesQueryOptions(api), select: (preferences) => preferences.editor });
}
