import { useQuery } from '@tanstack/react-query';
import type { Inbox, InboxItem, InboxSource } from '@devhub/contracts';
import { inboxQueryOptions } from '@devhub/api-client';
import { useApi } from '../../api.tsx';

/** A row Home can draw: one that leads with its tool's mark. */
export type HomeItem = InboxItem & { source: InboxSource };

/**
 * The list without the rows Home can't draw yet. A Claude session on neither a ticket nor a pull request has
 * no mark, and none can exist before spec 011, which asks for one (spec 007 plan, Risks).
 */
function drawable(inbox: Inbox) {
  return { ...inbox, items: inbox.items.filter((item): item is HomeItem => item.source !== null) };
}

/** Home's "Needs your attention" list. Kept fresh by `inbox.changed`, `settings.changed` and `status.changed`. */
export function useInbox() {
  const api = useApi();
  return useQuery({ ...inboxQueryOptions(api), select: drawable });
}

/** How many rows need you, for the sidebar; undefined until the list has loaded. */
export function useInboxCount(): number | undefined {
  const api = useApi();
  return useQuery({ ...inboxQueryOptions(api), select: (inbox) => drawable(inbox).items.length }).data;
}
