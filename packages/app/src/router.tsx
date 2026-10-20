import type { QueryClient } from '@tanstack/react-query';
import {
  createBrowserHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';
import type { ApiClient } from '@devhub/api-client';
import { HomeScreen } from './features/home/home-screen.tsx';
import { HomeSearchSchema } from './features/home/inbox-tabs.ts';
import { NotFoundScreen } from './features/not-found/not-found-screen.tsx';
import { SessionScreen } from './features/sessions/session-screen.tsx';
import { SessionsScreen } from './features/sessions/sessions-screen.tsx';
import { SessionsSearchSchema } from './features/sessions/session-filters.ts';
import { SettingsScreen } from './features/settings/settings-screen.tsx';
import { SettingsSearchSchema, SettingsTabSchema } from './features/settings/tabs.ts';
import { SessionSearchSchema } from './features/sessions/session-search.ts';
import { TicketsSearchSchema } from './features/tickets/filters.ts';
import { TicketsScreen } from './features/tickets/tickets-screen.tsx';
import { useTicketsStore } from './features/tickets/store.ts';
import { AppShell } from './shell/app-shell.tsx';

export interface RouterContext {
  queryClient: QueryClient;
  api: ApiClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: AppShell,
  notFoundComponent: NotFoundScreen,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  // The inbox's tab, search, filters, order and page (spec 007, Q10i); each left out when it's the default.
  validateSearch: (search) => HomeSearchSchema.parse(search),
  component: HomeScreen,
});

const ticketsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tickets',
  // The filters: `/tickets?assignee=anyone&due=week&type=bug`; the defaults have none (spec 008, Q3e).
  validateSearch: (search) => TicketsSearchSchema.parse(search),
  // Opened with no filters, from the sidebar say, Tickets opens on the last ones, before the first paint (spec 039,
  // AC-7). An address that names any filter wins.
  beforeLoad: ({ search, cause }) => {
    // Only on the way in: Clear filters, on the page, also leaves the address with none.
    if (cause !== 'enter' || Object.values(search).some((value) => value !== undefined)) return;
    const kept = useTicketsStore.getState().filters;
    if (Object.keys(kept).length === 0) return;
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirects by throwing
    throw redirect({ to: '/tickets', search: kept, replace: true });
  },
  component: TicketsScreen,
});

const sessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sessions',
  // Search sessions, Status and Kind: `/sessions?q=failing&status=done&kind=ask`; the defaults have none (spec 039).
  validateSearch: (search) => SessionsSearchSchema.parse(search),
  component: SessionsScreen,
});

const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sessions/$sessionId',
  // The tab and the changed file shown: `/sessions/<id>?tab=context`, `?file=src/a.ts` (spec 013).
  validateSearch: (search) => SessionSearchSchema.parse(search),
  component: SessionScreen,
});

const settingsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  beforeLoad: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirects by throwing
    throw redirect({ to: '/settings/$tab', params: { tab: 'connections' }, replace: true });
  },
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/$tab',
  params: {
    // An unknown tab falls back to Connections instead of an error page.
    parse: (raw) => ({ tab: SettingsTabSchema.catch('connections').parse(raw.tab) }),
    stringify: ({ tab }) => ({ tab }),
  },
  validateSearch: (search) => SettingsSearchSchema.parse(search),
  component: SettingsScreen,
});

export const routeTree = rootRoute.addChildren([
  homeRoute,
  ticketsRoute,
  sessionsRoute,
  sessionRoute,
  settingsIndexRoute,
  settingsRoute,
]);

export interface CreateRouterOptions extends RouterContext {
  /** Browser history by default; a desktop host passes hash history, tests pass memory history. */
  history?: RouterHistory;
}

export function createDevhubRouter({ history, ...context }: CreateRouterOptions) {
  return createRouter({
    routeTree,
    history: history ?? createBrowserHistory(),
    context,
    defaultPreload: 'intent',
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createDevhubRouter>;
  }
}
