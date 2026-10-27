import { useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiRequestError,
  queryKeys,
  preferencesQueryOptions,
  sessionBriefQueryOptions,
  sessionChangesQueryOptions,
  sessionDiffQueryOptions,
  sessionPagesQueryOptions,
  sessionCommandsQueryOptions,
  sessionPortsQueryOptions,
  sessionTerminalQueryOptions,
  sessionQueryKey,
  sessionsQueryOptions,
} from '@devhub/api-client';
import {
  terminalLimits,
  type ApprovalDecision,
  type ReplyRequest,
  type SendMessageInput,
  type Session,
  type SessionChangeRequest,
  type SessionListQuery,
  type TerminalSize,
} from '@devhub/contracts';
import type { TerminalScreen } from '@devhub/ui';
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
export function useSession(sessionId: string, enabled = true) {
  const api = useApi();
  return useQuery({
    enabled,
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

/**
 * Whether the worktree holds anything a pull request could take: a file that differs from where the branch
 * started. Not known yet, or not readable, is no (the user's call, 19 Oct 2026: no Create pull request for nothing).
 */
export function useHasChanges(sessionId: string, enabled = true): boolean {
  const api = useApi();
  const changes = useQuery({ ...sessionChangesQueryOptions(api, sessionId), enabled });
  return changes.data?.state === 'ready' && changes.data.files.length + changes.data.moreFiles > 0;
}

/** Renames or pins a session (spec 039); every list and the session itself read again once it's saved. */
export function useChangeSession() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, change }: { id: string; change: SessionChangeRequest }) => api.changeSession(id, change),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sessions }),
  });
}

/** Deletes a session, its brief and its worktree (spec 039); the lists read again once it's gone. */
export function useDeleteSession() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, branch }: { id: string; branch: boolean }) => api.deleteSession(id, { branch }),
    // Not awaited: the dialog moves focus on before the lists read again and its row, with the dialog, goes.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
    },
  });
}

/**
 * Deletes several sessions, keeping their branches (the user's call, 22 Oct 2026): one at a time, as each takes its
 * worktree out of the same repository. Answers the ids that went; any other failed, and nothing of it was deleted.
 */
export function useDeleteSessions() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: readonly string[]) => {
      const gone: string[] = [];
      for (const id of ids) {
        const deleted = await api.deleteSession(id, { branch: false }).then(
          () => true,
          () => false,
        );
        if (deleted) gone.push(id);
      }
      return gone;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
    },
  });
}

/** Exactly what Claude was sent at the start, read when it's shown (the user's call, 19 Oct 2026). */
export function useSessionBrief(sessionId: string) {
  const api = useApi();
  return useQuery(sessionBriefQueryOptions(api, sessionId));
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

/** Claude's replies to the pull request's review threads, asked each time the dialog opens; writes nothing (spec 049). */
export function useDraftReplies(sessionId: string) {
  const api = useApi();
  return useMutation({ mutationFn: () => api.draftReplies(sessionId) });
}

/** Reply to reviewers' Post replies (spec 049), on your press only. */
export function usePostReplies(sessionId: string) {
  const api = useApi();
  return useMutation({ mutationFn: (request: ReplyRequest) => api.postReplies(sessionId, request) });
}

/** Claude's commands with their output, for the Terminal's Claude tab (spec 036); `session.changed` keeps them fresh. */
export function useSessionCommands(sessionId: string) {
  const api = useApi();
  return useQuery(sessionCommandsQueryOptions(api, sessionId));
}

/**
 * What listens from the session (spec 042): asked every 3 seconds while the Ports tab is open, every 15 otherwise, and
 * only for a session with a Terminal, the only kind whose servers Orynx can find.
 */
export function useSessionPorts(session: Pick<Session, 'id' | 'terminal'>, { open = false } = {}) {
  const api = useApi();
  return useQuery({ ...sessionPortsQueryOptions(api, session.id, { open }), enabled: session.terminal });
}

/** Your shell tabs in the session's Terminal (spec 036); `session.terminal.changed` keeps them fresh. */
export function useSessionTerminal(sessionId: string) {
  const api = useApi();
  return useQuery(sessionTerminalQueryOptions(api, sessionId));
}

/** Adding and closing shell tabs (spec 036). `session.terminal.changed` says what changed, so nothing here touches the cache. */
export function useTerminalActions(sessionId: string) {
  const api = useApi();
  return {
    add: useMutation({ mutationFn: () => api.addTerminalTab(sessionId) }),
    close: useMutation({ mutationFn: (tabId: string) => api.closeTerminalTab(sessionId, tabId) }),
  };
}

/**
 * One shell tab's line to its shell (spec 038): its output, replay first; what you type, sent in order, one
 * request at a time, with keys typed meanwhile going together in the next; and its size. Keys that couldn't be
 * sent stay for the next try, and `failed` says so until a send goes.
 */
export function useShellTab(sessionId: string, tabId: string) {
  const api = useApi();
  const keys = useRef({ waiting: '', sending: false });
  const [failed, setFailed] = useState(false);

  const flush = async (): Promise<void> => {
    const queue = keys.current;
    if (queue.sending || queue.waiting === '') return;
    queue.sending = true;
    const data = queue.waiting.slice(0, terminalLimits.inputChars);
    try {
      await api.terminalInput(sessionId, tabId, data);
      queue.waiting = queue.waiting.slice(data.length);
      setFailed(false);
    } catch {
      setFailed(true);
      return;
    } finally {
      queue.sending = false;
    }
    await flush();
  };

  return {
    failed,
    connect: (screen: TerminalScreen) =>
      api.terminalOutput(sessionId, tabId, (frame) => {
        if (frame.kind === 'replay') screen.reset(frame.data);
        else screen.write(frame.data);
      }),
    send: (data: string) => {
      keys.current.waiting += data;
      void flush();
    },
    retry: () => {
      void flush();
    },
    resize: (size: TerminalSize) => {
      // A size that doesn't arrive is sent again with the next change, as the window or the dialog moves.
      api.resizeTerminal(sessionId, tabId, size).catch(() => undefined);
    },
  };
}
