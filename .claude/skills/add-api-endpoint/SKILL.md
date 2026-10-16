---
name: add-api-endpoint
description: Use when adding or changing an HTTP endpoint or a server event between packages/core and the app. Forbids hand-written response types, untyped axios calls, business logic inside route handlers, and calling axios outside @devhub/api-client.
---

# How to add an API endpoint

An endpoint touches four packages in a fixed order: contracts → core → api-client → app. The zod schema in contracts is the single source of truth for the shape.

## 1. Contract (`packages/contracts`)

1. Add the schema to `packages/contracts/src/<area>.ts` and export the inferred type.
2. Add the path to `apiRoutes` in `packages/contracts/src/routes.ts`.
3. Export both from `packages/contracts/src/index.ts`.
4. Add a builder to `@devhub/contracts/testing` so tests can make valid data.

```ts
// packages/contracts/src/status.ts
import { z } from 'zod';

export const IntegrationIdSchema = z.enum(['jira', 'github', 'slack']);
export const ConnectionStateSchema = z.enum(['connected', 'not_connected', 'needs_admin_approval', 'error']);

export const StatusSchema = z.object({
  version: z.string(),
  agent: z.object({ id: z.literal('claude'), connected: z.boolean() }),
  integrations: z.object({
    jira: IntegrationStatusSchema,
    github: IntegrationStatusSchema,
    slack: IntegrationStatusSchema,
  }),
});
export type Status = z.infer<typeof StatusSchema>;
```

```ts
// packages/contracts/src/routes.ts
export const apiRoutes = { status: '/api/status', events: '/api/events' } as const;
```

`contracts` imports only `zod`.

## 2. Route (`packages/core`)

1. Write the service in `packages/core/src/<area>/` (it may call integrations or storage).
2. Write the route as a `FastifyPluginCallbackZod` in `packages/core/src/routes/<area>.ts`, using the path from `apiPaths` (the plugin is registered under the `/api` prefix). The handler calls the service; it holds no business logic.
3. Register the plugin inside the `/api` plugin in `packages/core/src/create-server.ts`, and add both the relative path (`apiPaths`) and the full path (`apiRoutes`) in `packages/contracts/src/routes.ts`.

```ts
// packages/core/src/routes/status.ts
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { apiPaths, StatusSchema } from '@devhub/contracts';
import type { StatusService } from '../status/status-service.ts';

export const statusRoutes: FastifyPluginCallbackZod<{ status: StatusService }> = (app, { status }, done) => {
  app.get(apiPaths.status, { schema: { response: { 200: StatusSchema } } }, () => status.getStatus());
  done();
};
```

The `local-only` plugin (`packages/core/src/plugins/local-only.ts`) already checks the Host header and the `x-devhub-token` header for every `/api` route. Never bypass it.

4. Test it in `packages/core/src/routes/<area>.test.ts` with `app.inject()` against the real server from `createServer()`, including the 401 (no token) case.

## 3. Client (`packages/api-client`)

1. Add the endpoint function in `packages/api-client/src/endpoints/<area>.ts`. It **must** parse the response with the contract.
2. Add a method to `ApiClient` in `packages/api-client/src/client.ts`.
3. Add a query key and a `queryOptions` builder in `packages/api-client/src/queries.ts`.

```ts
// packages/api-client/src/endpoints/status.ts
import { apiRoutes, StatusSchema, type Status } from '@devhub/contracts';
import type { AxiosInstance } from 'axios';

export async function getStatus(http: AxiosInstance): Promise<Status> {
  const res = await http.get(apiRoutes.status);
  return StatusSchema.parse(res.data);
}
```

```ts
// packages/api-client/src/queries.ts
import { queryOptions } from '@tanstack/react-query';

export const queryKeys = { status: ['status'] as const };

export function statusQueryOptions(api: ApiClient) {
  return queryOptions({ queryKey: queryKeys.status, queryFn: () => api.status() });
}
```

4. Test it in `packages/api-client/src/<area>.test.ts` with an MSW handler that returns builder data, plus one case where the server returns a bad shape and the parse fails.

## 4. Feature hook (`packages/app`)

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

## 5. Live updates (if the data changes on the server)

1. Add an event to `ServerEventSchema` in `packages/contracts/src/events.ts` (a new member of the `type` union).
2. Publish it from the service with the event bus (`packages/core/src/events/event-bus.ts`).
3. Map it to `queryClient.invalidateQueries({ queryKey: … })` in `packages/app/src/live-updates.tsx`.

See `learn/live-updates.md`.

## Don't

- Don't write `interface StatusResponse { … }` by hand. Use `z.infer`.
- Don't call `axios` or `fetch` from `@devhub/app`. Every request goes through `ApiClient`.
- Don't return a value from a route that the response schema does not describe.
- Don't add a route outside `/api` or without the local-only checks.
- Don't import `@devhub/core` from any browser package.

## Checked by

`pnpm typecheck` (shapes line up) · `pnpm gate boundaries` · `pnpm test packages/contracts packages/core packages/api-client` · `pnpm lint`
