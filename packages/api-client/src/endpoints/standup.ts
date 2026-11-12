import type { AxiosInstance } from 'axios';
import { apiRoutes, StandupSchema, type Standup } from '@devhub/contracts';

/** The standup's draft for your last working day (spec 057, C). */
export async function getStandup(http: AxiosInstance): Promise<Standup> {
  const res = await http.get<unknown>(apiRoutes.standup);
  return StandupSchema.parse(res.data);
}
