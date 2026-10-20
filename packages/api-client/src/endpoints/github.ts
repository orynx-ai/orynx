import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  ConnectionCheckSchema,
  GitHubConnectionSchema,
  type ConnectionCheck,
  type GitHubConnection,
  type GitHubConnectionRequest,
} from '@devhub/contracts';

export async function getGitHubConnection(http: AxiosInstance): Promise<GitHubConnection> {
  const res = await http.get<unknown>(apiRoutes.githubConnection);
  return GitHubConnectionSchema.parse(res.data);
}

/** The server gets a token the way asked and checks it with GitHub before it saves anything. */
export async function putGitHubConnection(
  http: AxiosInstance,
  request: GitHubConnectionRequest,
): Promise<GitHubConnection> {
  const res = await http.put<unknown>(apiRoutes.githubConnection, request);
  return GitHubConnectionSchema.parse(res.data);
}

/** Test connection and Reconnect (spec 030): the server asks gh and GitHub now. */
export async function postGitHubConnectionCheck(http: AxiosInstance): Promise<ConnectionCheck> {
  const res = await http.post<unknown>(apiRoutes.githubConnectionCheck);
  return ConnectionCheckSchema.parse(res.data);
}

export async function deleteGitHubConnection(http: AxiosInstance): Promise<void> {
  await http.delete(apiRoutes.githubConnection);
}
