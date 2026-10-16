---
name: server-state
description: Use when a screen or component reads or changes data that lives on the local server (status, tickets, inbox, sessions, settings). Forbids fetching in useEffect, copying server data into zustand or useState, calling axios outside @devhub/api-client, and hand-patching the cache when an event can invalidate it.
---

# Server state with TanStack Query

Anything the local server owns is server state. It lives in the TanStack Query cache and nowhere else. Requests go through `ApiClient` from `@devhub/api-client`, which uses axios and parses every response with the contract.

## Reading

1. Find or add the `queryOptions` builder in `packages/api-client/src/queries.ts` (see `.claude/skills/add-api-endpoint/SKILL.md`).
2. Wrap it in a hook in the feature's `queries.ts`:

```ts
// packages/app/src/features/settings/queries.ts
import { statusQueryOptions } from '@devhub/api-client';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../api.tsx';

export function useStatus() {
  const api = useApi();
  return useQuery(statusQueryOptions(api));
}
```

3. In the component, branch on the query's state. Every screen handles loading, empty, error and loaded.

```tsx
const status = useStatus();
if (status.isPending) return <ConnectionsSkeleton />;
if (status.isError) return <ConnectionsError />;
return <ConnectionsList status={status.data} />;
```

- Use `select` to derive a view of the data. Never copy it into state to reshape it.
- Use `useSuspenseQuery` only where the route already has a Suspense boundary.

## Query keys

- All keys live in `queryKeys` in `packages/api-client/src/queries.ts`. Never write an inline array key in a feature.
- Keys go from general to specific: `["tickets"]`, `["tickets", sprintId]`, `["sessions", sessionId]`.

## Changing data

```ts
export function useStopSession() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api.stopSession(sessionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sessions }),
  });
}
```

- Invalidate after success. Use an optimistic update only when the spec asks for instant feedback, and roll it back in `onError`.
- Disable the button while `isPending` and say what failed when it errors.

## Live updates

The server pushes `ServerEvent`s over `/api/events`. `packages/app/src/live-updates.tsx` maps each event type to `invalidateQueries`. When you add an event, add its mapping there. Do not call `setQueryData` from an event unless the event carries the whole new value and the spec needs it instantly. See `learn/live-updates.md`.

## Background refresh

The spec refreshes lists every 2 minutes and on demand ("Synced 2 min ago · Refresh"). Set `refetchInterval` in the `queryOptions` builder, not in the component. The Refresh button calls `refetch()` or invalidates the key.

## Don't

- Don't `useEffect(() => { fetch(...) }, [])`.
- Don't put a ticket, an inbox item or a session in a zustand store.
- Don't `useState(data)` to keep a copy of query data.
- Don't import axios in `@devhub/app`.
- Don't catch an error and show nothing. Show one line that says what to do.

## Checked by

`pnpm lint` (`@tanstack/eslint-plugin-query`, restricted imports) · `pnpm gate boundaries` · `/review`
