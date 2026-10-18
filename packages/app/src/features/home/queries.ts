import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ComposerStart, Inbox, InboxItem, InboxSource } from '@devhub/contracts';
import { inboxQueryOptions, preferencesQueryOptions, queryKeys } from '@devhub/api-client';
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

/** Settings › Inbox rules, to say why a tab is empty. Kept fresh by `settings.changed`. */
export function useInboxRules() {
  const api = useApi();
  return useQuery({ ...preferencesQueryOptions(api), select: (preferences) => preferences.inboxRules });
}

/**
 * Refresh: syncs now and resolves once the sync has ended. It stays pending until the new list is in, so
 * the page bar reads "Synced just now" the moment the spinner stops (AC-17).
 */
export function useRefreshInbox() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...queryKeys.inbox, 'refresh'],
    mutationFn: () => api.refreshInbox(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.inbox }),
  });
}

/** Send in Home's composer (spec 015): starts a session from your message and chips, or says why it can't. */
export function useStartFromComposer() {
  const api = useApi();
  return useMutation({ mutationFn: (request: ComposerStart) => api.startSession(request) });
}
