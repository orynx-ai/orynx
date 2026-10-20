import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  CreatePullRequestAnswerSchema,
  CreatePullRequestRequestSchema,
  FileDiffSchema,
  PullRequestDraftAnswerSchema,
  PushAnswerSchema,
  PushDraftAnswerSchema,
  PushRequestSchema,
  RespondToApprovalRequestSchema,
  SendMessageAnswerSchema,
  SendMessageRequestSchema,
  SessionBriefSchema,
  SessionChangesSchema,
  SessionListSchema,
  SessionSchema,
  StartSessionAnswerSchema,
  type ApprovalDecision,
  type CreatePullRequestAnswer,
  type CreatePullRequestRequest,
  type FileDiff,
  type PullRequestDraftAnswer,
  type PushAnswer,
  type PushDraftAnswer,
  type SendMessageAnswer,
  type SendMessageInput,
  type SessionBrief,
  type SessionChanges,
  type Session,
  type SessionList,
  type SessionListQuery,
  SessionChangeRequestSchema,
  type SessionChangeRequest,
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

/** A new title or a pin (spec 039). */
export async function patchSession(http: AxiosInstance, id: string, change: SessionChangeRequest): Promise<void> {
  await http.patch(pathFor(apiRoutes.session, id), SessionChangeRequestSchema.parse(change));
}

/** Deletes the session, its brief and its worktree; its branch stays (spec 039). */
export async function deleteSession(http: AxiosInstance, id: string): Promise<void> {
  await http.delete(pathFor(apiRoutes.session, id));
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
export async function postSessionMessage(
  http: AxiosInstance,
  id: string,
  request: SendMessageInput,
): Promise<SendMessageAnswer> {
  const res = await http.post<unknown>(pathFor(apiRoutes.sessionMessages, id), SendMessageRequestSchema.parse(request));
  return SendMessageAnswerSchema.parse(res.data);
}

/** Exactly what Orynx sent Claude at the start (spec 011, Q5). */
export async function getSessionBrief(http: AxiosInstance, id: string): Promise<SessionBrief> {
  const res = await http.get<unknown>(pathFor(apiRoutes.sessionBrief, id));
  return SessionBriefSchema.parse(res.data);
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

/** Claude's draft of the pull request, which changes nothing on the server (spec 014, AC-14). */
export async function postPullRequestDraft(http: AxiosInstance, id: string): Promise<PullRequestDraftAnswer> {
  const res = await http.post<unknown>(pathFor(apiRoutes.sessionPullRequestDraft, id));
  return PullRequestDraftAnswerSchema.parse(res.data);
}

/** Commits, pushes and opens the pull request with your title and description (spec 014). */
export async function postPullRequest(
  http: AxiosInstance,
  id: string,
  request: CreatePullRequestRequest,
): Promise<CreatePullRequestAnswer> {
  const res = await http.post<unknown>(
    pathFor(apiRoutes.sessionPullRequest, id),
    CreatePullRequestRequestSchema.parse(request),
  );
  return CreatePullRequestAnswerSchema.parse(res.data);
}

/** Claude's commit message for what's new since the last push (spec 014, Q7). */
export async function postPushDraft(http: AxiosInstance, id: string): Promise<PushDraftAnswer> {
  const res = await http.post<unknown>(pathFor(apiRoutes.sessionPushDraft, id));
  return PushDraftAnswerSchema.parse(res.data);
}

/** Commits what's new and pushes it to the pull request, with your commit message (spec 014, Q7). */
export async function postPush(http: AxiosInstance, id: string, message: string): Promise<PushAnswer> {
  const res = await http.post<unknown>(pathFor(apiRoutes.sessionPush, id), PushRequestSchema.parse({ message }));
  return PushAnswerSchema.parse(res.data);
}
