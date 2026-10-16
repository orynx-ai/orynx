import type { AxiosInstance } from 'axios';
import { apiRoutes, SessionListSchema, type SessionList, type SessionListQuery } from '@devhub/contracts';

export async function getSessions(http: AxiosInstance, query: SessionListQuery = {}): Promise<SessionList> {
  const res = await http.get<unknown>(apiRoutes.sessions, { params: query });
  return SessionListSchema.parse(res.data);
}
