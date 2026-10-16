import type { AxiosInstance } from 'axios';
import { apiRoutes, StatusSchema, type Status } from '@devhub/contracts';

export async function getStatus(http: AxiosInstance): Promise<Status> {
  const res = await http.get<unknown>(apiRoutes.status);
  return StatusSchema.parse(res.data);
}
