import type { AxiosInstance } from 'axios';
import { AgentModelsSchema, apiRoutes, ClaudeLoginSchema, type AgentModels, type ClaudeLogin } from '@devhub/contracts';

export async function getClaudeLogin(http: AxiosInstance): Promise<ClaudeLogin> {
  const res = await http.get<unknown>(apiRoutes.claudeLogin);
  return ClaudeLoginSchema.parse(res.data);
}

/** Check again: the server asks Claude Code now and answers with what it found. */
export async function postClaudeLoginCheck(http: AxiosInstance): Promise<ClaudeLogin> {
  const res = await http.post<unknown>(apiRoutes.claudeLoginCheck);
  return ClaudeLoginSchema.parse(res.data);
}

/** The models Claude offers now, for the composer's agent picker. */
export async function getAgentModels(http: AxiosInstance): Promise<AgentModels> {
  const res = await http.get<unknown>(apiRoutes.agentModels);
  return AgentModelsSchema.parse(res.data);
}
