import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import { vi } from 'vitest';
import { DevhubApp } from '../devhub-app.tsx';
import type { Platform } from '../platform.tsx';
import { FakeEventSource } from './fake-event-source.ts';
import { testBaseURL } from './msw.ts';

export const testToken = 'test-token';

/**
 * Renders the real app (real router, real QueryClient, real api-client) at a route.
 * Only the network (MSW), the browser's EventSource and the host Platform are stand-ins.
 * Resolves once the shell is on screen.
 */
export async function renderApp({
  route = '/',
  platform: platformOverrides = {},
}: {
  route?: string;
  /** Which host and system to pretend to be; a web page on a Mac by default. */
  platform?: Partial<Pick<Platform, 'kind' | 'os'>>;
} = {}) {
  const history = createMemoryHistory({ initialEntries: [route] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const platform = {
    kind: 'web',
    os: 'mac',
    ...platformOverrides,
    openExternal: vi.fn(),
    reload: vi.fn(),
  } satisfies Platform;
  const user = userEvent.setup();

  const result = render(
    <DevhubApp
      server={{ baseURL: testBaseURL, token: testToken, EventSource: FakeEventSource }}
      platform={platform}
      history={history}
      queryClient={queryClient}
    />,
  );

  // The router renders after its first match; wait for the shell so tests start from a real page.
  await screen.findByRole('main');

  return { ...result, user, history, platform, queryClient };
}
