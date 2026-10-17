import type { AxiosInstance } from 'axios';
import { apiRoutes, JiraConnectionSchema, type JiraConnection, type JiraConnectionRequest } from '@devhub/contracts';

export async function getJiraConnection(http: AxiosInstance): Promise<JiraConnection> {
  const res = await http.get<unknown>(apiRoutes.jiraConnection);
  return JiraConnectionSchema.parse(res.data);
}

/** The server checks these with Jira before it saves anything. */
export async function putJiraConnection(http: AxiosInstance, request: JiraConnectionRequest): Promise<JiraConnection> {
  const res = await http.put<unknown>(apiRoutes.jiraConnection, request);
  return JiraConnectionSchema.parse(res.data);
}

export async function deleteJiraConnection(http: AxiosInstance): Promise<void> {
  await http.delete(apiRoutes.jiraConnection);
}
