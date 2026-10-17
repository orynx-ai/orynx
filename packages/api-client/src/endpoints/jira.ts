import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  JiraConnectionSchema,
  JiraProjectListSchema,
  type JiraConnection,
  type JiraConnectionRequest,
  type JiraProjectList,
} from '@devhub/contracts';

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

/** The projects the saved connection can see; the server asks Jira each time. */
export async function getJiraProjects(http: AxiosInstance): Promise<JiraProjectList> {
  const res = await http.get<unknown>(apiRoutes.jiraProjects);
  return JiraProjectListSchema.parse(res.data);
}
