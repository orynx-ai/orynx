import type { AxiosInstance } from 'axios';
import { apiRoutes, InboxSchema, type Inbox } from '@devhub/contracts';

export async function getInbox(http: AxiosInstance): Promise<Inbox> {
  const res = await http.get<unknown>(apiRoutes.inbox);
  return InboxSchema.parse(res.data);
}

/** Resolves once the server's sync has ended. */
export async function postInboxRefresh(http: AxiosInstance): Promise<void> {
  await http.post(apiRoutes.inboxRefresh);
}

export async function deleteInboxCache(http: AxiosInstance): Promise<void> {
  await http.delete(apiRoutes.inboxCache);
}
