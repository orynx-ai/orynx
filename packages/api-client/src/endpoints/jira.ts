import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  ConnectionCheckSchema,
  JiraConnectionSchema,
  JiraProjectListSchema,
  type ConnectionCheck,
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

/** Test connection and Reconnect (spec 030): the server asks Jira now. */
export async function postJiraConnectionCheck(http: AxiosInstance): Promise<ConnectionCheck> {
  const res = await http.post<unknown>(apiRoutes.jiraConnectionCheck);
  return ConnectionCheckSchema.parse(res.data);
}

export async function deleteJiraConnection(http: AxiosInstance): Promise<void> {
  await http.delete(apiRoutes.jiraConnection);
}

/** The projects the saved connection can see; the server asks Jira each time. */
export async function getJiraProjects(http: AxiosInstance): Promise<JiraProjectList> {
  const res = await http.get<unknown>(apiRoutes.jiraProjects);
  return JiraProjectListSchema.parse(res.data);
}
