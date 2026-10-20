import type { AxiosInstance } from 'axios';
import { apiRoutes, InboxSchema, type Inbox, type InboxSource } from '@devhub/contracts';

export async function getInbox(http: AxiosInstance): Promise<Inbox> {
  const res = await http.get<unknown>(apiRoutes.inbox);
  return InboxSchema.parse(res.data);
}

/** Resolves once the server's sync has ended: every connected tool's, or `tool`'s alone (spec 035). */
export async function postInboxRefresh(http: AxiosInstance, tool?: InboxSource): Promise<void> {
  await http.post(apiRoutes.inboxRefresh, undefined, { params: { tool } });
}

export async function deleteInboxCache(http: AxiosInstance): Promise<void> {
  await http.delete(apiRoutes.inboxCache);
}
