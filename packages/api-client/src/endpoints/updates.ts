import type { AxiosInstance } from 'axios';
import { apiRoutes, UpdatesSchema, type UpdateInstall, type Updates } from '@devhub/contracts';

export async function getUpdates(http: AxiosInstance): Promise<Updates> {
  const res = await http.get<unknown>(apiRoutes.updates);
  return UpdatesSchema.parse(res.data);
}

/** Asks GitHub unless the hub did less than a minute ago, and answers once it has. */
export async function postUpdatesCheck(http: AxiosInstance): Promise<Updates> {
  const res = await http.post<unknown>(apiRoutes.updatesCheck);
  return UpdatesSchema.parse(res.data);
}

export async function postUpdatesInstall(http: AxiosInstance, request: UpdateInstall): Promise<Updates> {
  const res = await http.post<unknown>(apiRoutes.updatesInstall, request);
  return UpdatesSchema.parse(res.data);
}
