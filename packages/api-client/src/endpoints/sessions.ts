import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  FileDiffSchema,
  RespondToApprovalRequestSchema,
  SendMessageAnswerSchema,
  SendMessageRequestSchema,
  SessionChangesSchema,
  SessionListSchema,
  SessionSchema,
  StartSessionAnswerSchema,
  type ApprovalDecision,
  type FileDiff,
  type SendMessageAnswer,
  type SessionChanges,
  type Session,
  type SessionList,
  type SessionListQuery,
  type StartSessionAnswer,
  type StartSessionRequest,
} from '@devhub/contracts';

const pathFor = (route: string, id: string) => route.replace(':id', encodeURIComponent(id));

export async function getSessions(http: AxiosInstance, query: SessionListQuery = {}): Promise<SessionList> {
  const res = await http.get<unknown>(apiRoutes.sessions, { params: query });
  return SessionListSchema.parse(res.data);
}

export async function getSession(http: AxiosInstance, id: string): Promise<Session> {
  const res = await http.get<unknown>(pathFor(apiRoutes.session, id));
  return SessionSchema.parse(res.data);
}

/**
 * Starts Claude on a ticket (spec 011) or from the composer with its chips (spec 015), or says why it can't (Q4),
 * including which chip Jira or GitHub couldn't give; the server creates nothing then.
 */
export async function postSession(http: AxiosInstance, request: StartSessionRequest): Promise<StartSessionAnswer> {
  const res = await http.post<unknown>(apiRoutes.sessions, request);
  return StartSessionAnswerSchema.parse(res.data);
}

export async function postSessionStop(http: AxiosInstance, id: string): Promise<void> {
  await http.post(pathFor(apiRoutes.sessionStop, id));
}

export async function postSessionDiscard(http: AxiosInstance, id: string): Promise<void> {
  await http.post(pathFor(apiRoutes.sessionDiscard, id));
}

/** Your answer to a call waiting in a session (spec 012). */
export async function postApproval(
  http: AxiosInstance,
  id: string,
  approvalId: string,
  decision: ApprovalDecision,
): Promise<void> {
  const path = pathFor(apiRoutes.sessionApproval, id).replace(':approvalId', encodeURIComponent(approvalId));
  await http.post(path, RespondToApprovalRequestSchema.parse({ decision }));
}

/** A follow-up (spec 013): exactly your text, which the server sends Claude, or why it can't. */
export async function postSessionMessage(http: AxiosInstance, id: string, text: string): Promise<SendMessageAnswer> {
  const res = await http.post<unknown>(
    pathFor(apiRoutes.sessionMessages, id),
    SendMessageRequestSchema.parse({ text }),
  );
  return SendMessageAnswerSchema.parse(res.data);
}

/** What changed in the session's worktree (spec 013). */
export async function getSessionChanges(http: AxiosInstance, id: string): Promise<SessionChanges> {
  const res = await http.get<unknown>(pathFor(apiRoutes.sessionChanges, id));
  return SessionChangesSchema.parse(res.data);
}

/** One changed file's diff; the path goes in the query, which axios encodes. */
export async function getFileDiff(http: AxiosInstance, id: string, path: string): Promise<FileDiff> {
  const res = await http.get<unknown>(pathFor(apiRoutes.sessionChangesDiff, id), { params: { path } });
  return FileDiffSchema.parse(res.data);
}
