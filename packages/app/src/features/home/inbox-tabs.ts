import { z } from 'zod';
import type { InboxItem, InboxTab } from '@devhub/contracts';

/**
 * Home's inbox tabs (spec 007, Q1a: no Slack tab until 016). The tab is part of the address: All has no
 * parameter, the others are `/?inbox=jira` and `/?inbox=pull-requests`.
 */
export const homeTabs = ['all', 'jira', 'pull-requests'] as const;
export type HomeTab = (typeof homeTabs)[number];

export const HomeSearchSchema = z.object({
  // An unknown tab opens All instead of an error page.
  inbox: z.enum(['jira', 'pull-requests']).optional().catch(undefined),
});
export type HomeSearch = z.infer<typeof HomeSearchSchema>;

export const homeTabLabels: Record<HomeTab, string> = { all: 'All', jira: 'Jira', 'pull-requests': 'Pull requests' };

const inboxTabs: Record<Exclude<HomeTab, 'all'>, InboxTab> = { jira: 'jira', 'pull-requests': 'pull_requests' };

/** The tab's own key in `tabCounts`. */
export function countKey(tab: HomeTab): 'all' | InboxTab {
  return tab === 'all' ? 'all' : inboxTabs[tab];
}

/** The rows a tab shows; All shows every row. */
export function itemsInTab<Item extends InboxItem>(items: readonly Item[], tab: HomeTab): Item[] {
  return tab === 'all' ? [...items] : items.filter((item) => item.tab === inboxTabs[tab]);
}
