import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, type RouterHistory } from '@tanstack/react-router';
import { createApiClient, type EventSourceConstructor } from '@devhub/api-client';
import { ApiProvider } from './api.tsx';
import { LiveUpdates } from './live-updates.tsx';
import { PlatformProvider, type Platform } from './platform.tsx';
import { createDevhubRouter } from './router.tsx';
import { useConnectionStore } from './stores/connection-store.ts';
import { applyTheme, useThemeStore } from './stores/theme-store.ts';

export interface DevhubAppProps {
  /** Where the local server is and the token the page was given. */
  server: { baseURL: string; token: string; EventSource?: EventSourceConstructor };
  platform: Platform;
  history?: RouterHistory;
  queryClient?: QueryClient;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
}

/** The whole product UI. Hosts (apps/web, a future apps/desktop) render only this. */
export function DevhubApp({ server, platform, history, queryClient: givenQueryClient }: DevhubAppProps) {
  const [queryClient] = useState(() => givenQueryClient ?? createQueryClient());
  const [api] = useState(() =>
    createApiClient({
      baseURL: server.baseURL,
      token: server.token,
      onUnauthorized: () => {
        useConnectionStore.getState().markStale();
      },
      ...(server.EventSource ? { EventSource: server.EventSource } : {}),
    }),
  );
  const [router] = useState(() => createDevhubRouter({ queryClient, api, ...(history ? { history } : {}) }));

  const theme = useThemeStore((state) => state.theme);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <PlatformProvider platform={platform}>
      <ApiProvider api={api}>
        <QueryClientProvider client={queryClient}>
          <LiveUpdates />
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ApiProvider>
    </PlatformProvider>
  );
}
