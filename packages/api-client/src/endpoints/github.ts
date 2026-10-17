import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  GitHubConnectionSchema,
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

export async function deleteGitHubConnection(http: AxiosInstance): Promise<void> {
  await http.delete(apiRoutes.githubConnection);
}
