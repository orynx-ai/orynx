import type { AxiosInstance } from 'axios';
import { apiRoutes, CodexLoginSchema, type CodexLogin } from '@devhub/contracts';

/** Codex's login on this computer, as the server last read it (spec 052). */
export async function getCodexLogin(http: AxiosInstance): Promise<CodexLogin> {
  const res = await http.get<unknown>(apiRoutes.codexLogin);
  return CodexLoginSchema.parse(res.data);
}

/** Check again: the server asks Codex now and answers with what it found. */
export async function postCodexLoginCheck(http: AxiosInstance): Promise<CodexLogin> {
  const res = await http.post<unknown>(apiRoutes.codexLoginCheck);
  return CodexLoginSchema.parse(res.data);
}
