import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import {
  ApiRequestError,
  preferencesQueryOptions,
  sessionChangesQueryOptions,
  sessionDiffQueryOptions,
  sessionPagesQueryOptions,
  sessionQueryKey,
  sessionsQueryOptions,
} from '@devhub/api-client';
import type { ApprovalDecision, SendMessageInput, Session, SessionListQuery } from '@devhub/contracts';
import { useApi } from '../../api.tsx';

/** Sessions with the newest activity first. Kept fresh by `sessions.changed` events, not polling. */
export function useSessions(query: SessionListQuery = {}) {
  const api = useApi();
  return useQuery(sessionsQueryOptions(api, query));
}

/** Sessions a page at a time, newest activity first (spec 020: the sidebar's infinite list). */
export function useSessionPages(query: Omit<SessionListQuery, 'cursor'>) {
  const api = useApi();
  return useInfiniteQuery(sessionPagesQueryOptions(api, query));
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

/**
 * A follow-up (spec 013): the answer says sent, or why it can't go. The session changes on the server, which
 * says so with `session.changed` and `sessions.changed`, so nothing here touches the cache.
 */
export function useSendMessage(sessionId: string) {
  const api = useApi();
  return useMutation({ mutationFn: (request: SendMessageInput) => api.sendMessage(sessionId, request) });
}

/** Claude's draft of the pull request (spec 014): asked on opening the dialog, never cached, since each asks Claude. */
export function useDraftPullRequest(sessionId: string) {
  const api = useApi();
  return useMutation({ mutationFn: () => api.draftPullRequest(sessionId) });
}

/**
 * Create pull request (spec 014): commits, pushes and opens it on your press. The session changes on the server,
 * which says so with `sessions.changed` and `session.changed`, so nothing here touches the cache.
 */
export function useCreatePullRequest(sessionId: string) {
  const api = useApi();
  return useMutation({
    mutationFn: (request: { title: string; body: string }) => api.createPullRequest(sessionId, request),
  });
}

/** Claude's commit message for what's new since the last push (spec 014, Q7): asked on opening, never cached. */
export function useDraftPush(sessionId: string) {
  const api = useApi();
  return useMutation({ mutationFn: () => api.draftPush(sessionId) });
}

/** Push changes (spec 014, Q7), on your press; the server's events refresh the session. */
export function usePushChanges(sessionId: string) {
  const api = useApi();
  return useMutation({ mutationFn: (message: string) => api.pushChanges(sessionId, message) });
}
