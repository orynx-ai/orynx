import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  ConnectionCheckSchema,
  SlackConnectionSchema,
  type ConnectionCheck,
  type SlackConnection,
  type SlackConnectionRequest,
} from '@devhub/contracts';

export async function getSlackConnection(http: AxiosInstance): Promise<SlackConnection> {
  const res = await http.get<unknown>(apiRoutes.slackConnection);
  return SlackConnectionSchema.parse(res.data);
}

/** The server checks the token with Slack, and its scopes, before it saves anything (spec 016). */
export async function putSlackConnection(
  http: AxiosInstance,
  request: SlackConnectionRequest,
): Promise<SlackConnection> {
  const res = await http.put<unknown>(apiRoutes.slackConnection, request);
  return SlackConnectionSchema.parse(res.data);
}

/** Test connection and Reconnect (spec 030): the server asks Slack now. */
export async function postSlackConnectionCheck(http: AxiosInstance): Promise<ConnectionCheck> {
  const res = await http.post<unknown>(apiRoutes.slackConnectionCheck);
  return ConnectionCheckSchema.parse(res.data);
}

export async function deleteSlackConnection(http: AxiosInstance): Promise<void> {
  await http.delete(apiRoutes.slackConnection);
}
