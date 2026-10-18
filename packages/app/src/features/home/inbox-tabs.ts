import { z } from 'zod';
import type { InboxItem, InboxTab } from '@devhub/contracts';

/**
 * Home's inbox tabs (spec 007, Q1a: no Slack tab until 016). The tab is part of the address: All has no
 * parameter, the others are `/?inbox=jira` and `/?inbox=pull-requests`.
 */
export const homeTabs = ['all', 'jira', 'pull-requests'] as const;
export type HomeTab = (typeof homeTabs)[number];

/** Text in the address; the router reads `q=2841` as a number. */
const text = z.union([z.string(), z.number()]).transform(String);

/**
 * The tab, then the list's search, filters, order and page (spec 007, Q10i). Filters are comma lists
 * (`reason=checks-failing,to-do`). Anything the address holds that can't be read is left out, so a
 * hand-typed address still opens, on All.
 */
export const HomeSearchSchema = z.object({
  inbox: z.enum(['jira', 'pull-requests']).optional().catch(undefined),
  q: text.optional().catch(undefined),
  reason: text.optional().catch(undefined),
  project: text.optional().catch(undefined),
  status: text.optional().catch(undefined),
  repo: text.optional().catch(undefined),
  sort: z.literal('longest').optional().catch(undefined),
  page: z.coerce.number().int().min(2).optional().catch(undefined),
});
export type HomeSearch = z.infer<typeof HomeSearchSchema>;

export const homeTabLabels: Record<HomeTab, string> = { all: 'All', jira: 'Jira', 'pull-requests': 'Pull requests' };

const inboxTabs: Record<Exclude<HomeTab, 'all'>, InboxTab> = { jira: 'jira', 'pull-requests': 'pull_requests' };

/** The tools whose rows a tab shows. */
export const tabTools: Record<HomeTab, readonly ('jira' | 'github')[]> = {
  all: ['jira', 'github'],
  jira: ['jira'],
  'pull-requests': ['github'],
};

/** The tab's own key in `tabCounts` and `emptyText`. */
export function countKey(tab: HomeTab): 'all' | InboxTab {
  return tab === 'all' ? 'all' : inboxTabs[tab];
}

/** The rows a tab shows; All shows every row. */
export function itemsInTab<Item extends InboxItem>(items: readonly Item[], tab: HomeTab): Item[] {
  return tab === 'all' ? [...items] : items.filter((item) => item.tab === inboxTabs[tab]);
}
