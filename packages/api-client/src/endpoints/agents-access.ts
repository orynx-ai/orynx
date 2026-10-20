import type { AxiosInstance } from 'axios';
import { AgentsAccessSchema, apiRoutes, McpConfigSchema, type AgentsAccess, type McpConfig } from '@devhub/contracts';

/** Whether agents outside Orynx may use its tickets (spec 037). */
export async function getAgentsAccess(http: AxiosInstance): Promise<AgentsAccess> {
  const res = await http.get<unknown>(apiRoutes.agentsAccess);
  return AgentsAccessSchema.parse(res.data);
}

export async function putAgentsAccess(http: AxiosInstance, access: AgentsAccess): Promise<AgentsAccess> {
  const res = await http.put<unknown>(apiRoutes.agentsAccess, access);
  return AgentsAccessSchema.parse(res.data);
}

/** Writes the bridge for the agents' token and answers the MCP config that runs it; it holds no token. */
export async function postMcpConfig(http: AxiosInstance): Promise<McpConfig> {
  const res = await http.post<unknown>(apiRoutes.agentsAccessConfig);
  return McpConfigSchema.parse(res.data);
}
