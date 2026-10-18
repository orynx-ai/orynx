import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  RespondToApprovalRequestSchema,
  SessionListSchema,
  SessionSchema,
  StartSessionAnswerSchema,
  type ApprovalDecision,
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

/** Starts Claude on a ticket, or says why it can't (spec 011, Q4); the server creates nothing then. */
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
