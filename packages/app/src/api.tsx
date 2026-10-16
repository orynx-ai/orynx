import { createContext, use, type ReactNode } from 'react';
import type { ApiClient } from '@devhub/api-client';

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ api, children }: { api: ApiClient; children: ReactNode }) {
  return <ApiContext value={api}>{children}</ApiContext>;
}

/** The one api-client instance. Feature hooks pass it to the api-client's queryOptions. */
export function useApi(): ApiClient {
  const api = use(ApiContext);
  if (api === null) throw new Error('useApi() must be used inside <DevhubApp>.');
  return api;
}
