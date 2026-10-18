import type { AxiosInstance } from 'axios';
import { apiRoutes, ClaudeLoginSchema, type ClaudeLogin } from '@devhub/contracts';

export async function getClaudeLogin(http: AxiosInstance): Promise<ClaudeLogin> {
  const res = await http.get<unknown>(apiRoutes.claudeLogin);
  return ClaudeLoginSchema.parse(res.data);
}

/** Check again: the server asks Claude Code now and answers with what it found. */
export async function postClaudeLoginCheck(http: AxiosInstance): Promise<ClaudeLogin> {
  const res = await http.post<unknown>(apiRoutes.claudeLoginCheck);
  return ClaudeLoginSchema.parse(res.data);
}
