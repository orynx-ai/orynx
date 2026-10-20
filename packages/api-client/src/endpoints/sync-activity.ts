import type { AxiosInstance } from 'axios';
import { apiRoutes, SyncActivitySchema, type SyncActivity, type SyncActivityQuery } from '@devhub/contracts';

export async function getSyncActivity(http: AxiosInstance, query: SyncActivityQuery): Promise<SyncActivity> {
  const res = await http.get<unknown>(apiRoutes.syncActivity, { params: query });
  return SyncActivitySchema.parse(res.data);
}
