<!-- learn-sources: packages/contracts/src/status.ts packages/core/src/routes/status.ts packages/api-client/src/endpoints/status.ts packages/api-client/src/queries.ts packages/app/src/features/settings/queries.ts -->

# How a request flows

This page follows one request, `GET /api/status`, from the zod schema to the pixels in Settings › Connections. Every endpoint in DevHub has the same shape, so once you know this one you know them all. The how-to version is `.claude/skills/add-api-endpoint/SKILL.md`.

## The path

```
@devhub/contracts      StatusSchema, apiRoutes.status          one source of truth for the shape
        │
        ├──────────────▶ @devhub/core          route validates its response against StatusSchema
        │                     ▲
        │                     │ HTTP, x-devhub-token, Host 127.0.0.1:4317
        │                     │
        └──────────────▶ @devhub/api-client    getStatus() parses the body with StatusSchema
                              │
                              ▼
                         statusQueryOptions(api)              query key + fetcher
                              │
                              ▼
                         @devhub/app  useStatus()             TanStack Query cache
                              │
                              ▼
                         Settings screen                      loading / error / loaded
```

## 1. The contract

`packages/contracts/src/status.ts` defines `StatusSchema`: the app version, the user's name for the sidebar footer (from `git config --global user.name`, read once per start, or `null`), whether Claude is connected, and the connection state of Jira, GitHub and Slack (`connected`, `not_connected`, `needs_admin_approval`, `error`). `type Status = z.infer<typeof StatusSchema>` is derived from it, so there is no separate interface to keep in sync. The path lives in `apiRoutes.status` in `packages/contracts/src/routes.ts`.

Both the server and the browser import this package, which is why it may import nothing but `zod`.

## 2. The route

`packages/core/src/routes/status.ts` is a Fastify plugin registered under the `/api` prefix, so it uses the relative path `apiPaths.status`. It declares `StatusSchema` as the 200 response schema through `fastify-type-provider-zod`, so:

- TypeScript rejects a handler that returns the wrong shape, and
- Fastify serialises only what the schema describes.

Before the handler runs, the `local-only` plugin checks the Host header and the session token (see `learn/local-security.md`). The handler itself only asks a service for the answer; the route holds no logic.

## 3. The client function

`packages/api-client/src/endpoints/status.ts` calls `http.get(apiRoutes.status)` on the shared axios instance (which adds `x-devhub-token`) and returns `StatusSchema.parse(res.data)`. Parsing here means a server that drifts from the contract fails loudly at the boundary, with a zod error naming the field, instead of rendering `undefined` somewhere deep in a component.

## 4. The query options

`packages/api-client/src/queries.ts` turns the function into `statusQueryOptions(api)`: a query key from `queryKeys` plus the fetcher. Keeping keys in one place means an event can invalidate exactly the right cache entries (see `learn/live-updates.md`). Keys go from general to specific: the sidebar's session list is `['sessions', { limit: 5 }]` and the full list is `['sessions', {}]`, so invalidating `queryKeys.sessions` refreshes both.

## 5. The feature hook

`packages/app/src/features/settings/queries.ts` wraps it:

```ts
export function useStatus() {
  const api = useApi();
  return useQuery(statusQueryOptions(api));
}
```

`useApi()` reads the `ApiClient` from `ApiProvider`, which the host (`apps/web`, later `apps/desktop`) creates with the base URL and the token.

## 6. The screen

The Settings screen (and the sidebar footer) calls `useStatus()` and renders one of its states: a skeleton while pending, a one-line error, or the Jira, GitHub and Slack rows with their pills. It never stores the result in `useState` or zustand; the query cache is the only copy.

## Testing each layer

| Layer    | Test                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------- |
| Contract | parse valid and invalid data                                                                    |
| Route    | `app.inject()` against `createServer()`: 200 with a token, 401 without, 403 with a foreign Host |
| Client   | MSW returns `makeStatus()`; a broken body makes the parse throw                                 |
| Screen   | `await renderApp({ route: "/settings" })` with an MSW handler; assert the visible text          |

No layer fakes another layer of our own code. The only fake is the network, at the boundary.
