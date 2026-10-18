<!-- learn-sources: packages/core/src/events/event-bus.ts packages/core/src/routes/events.ts packages/api-client/src/events.ts packages/app/src/live-updates.tsx -->

# Live updates: how the page hears about changes

When something changes on the server (a connection is made, Claude finishes a step, an approval is needed), the page should show it without the user pressing Refresh. DevHub does this with server-sent events (SSE) and TanStack Query invalidation.

## The path

```
service in core ──publish(event)──▶ event bus ──▶ GET /api/events (SSE)
                                                       │  data: {"type":"status.changed"}
                                                       ▼
                                   api-client subscribe(onEvent)   parses with ServerEventSchema
                                                       │
                                                       ▼
                                   app <LiveUpdates>   queryClient.invalidateQueries({ queryKey })
                                                       │
                                                       ▼
                                   any screen using that query refetches and re-renders
```

## 1. The event union

`ServerEventSchema` in `packages/contracts/src/events.ts` is a zod discriminated union on `type`. Today it has `hello` (sent when a stream opens), `status.changed`, `sessions.changed` (a session started, or one changed its state or title), `session.changed { sessionId }` (one session's steps changed, spec 011), `settings.changed` (a value in Settings › Coding agent, Repositories or Inbox rules was saved, spec 005) and `inbox.changed` (a sync ended, the cache was cleared or a tool's rows went, spec 007). Tickets' sprint syncs with the inbox (spec 008), so `inbox.changed` refreshes it too, with no event of its own. ⌘K search (spec 009) reads the same cache and the sessions, so `inbox.changed`, `status.changed` and `sessions.changed` refresh it, and `settings.changed` doesn't: the inbox rules never hide anything from search. Every new kind of change adds a member here first, so the server and the page agree on the payload.

## 2. The event bus

`packages/core/src/events/event-bus.ts` exports `createEventBus()`: `publish(event)` sends an event to every subscriber, and `subscribe(fn)` returns an unsubscribe function. Services publish; they never know who is listening. The stream subscribes with `{ page: true }`, so `pageCount()` says how many pages are open apart from the hub's own listeners; the inbox syncs on its own only while one is (spec 007).

## 3. The stream

`packages/core/src/routes/events.ts` serves `GET /api/events` as `text/event-stream`. On connect it sends `hello`, then forwards every bus event as a `data:` line of JSON. It subscribes as a page. When the browser disconnects, the route unsubscribes from the bus so nothing leaks. Because `EventSource` cannot send headers, this one route accepts the session token as `?token=` (see `learn/local-security.md`).

## 4. The client

`packages/api-client/src/events.ts` opens an `EventSource` on `/api/events?token=…`, parses each message with `ServerEventSchema`, and calls `onEvent` with a typed `ServerEvent`. A message that does not parse is dropped rather than passed on. `ApiClient.subscribe(onEvent)` returns a function that closes the stream. `EventSource` reconnects by itself if the server restarts.

## 5. The app

`packages/app/src/live-updates.tsx` subscribes once, near the root, and maps each event type to the queries it makes stale:

```ts
import { queryKeys, sessionQueryKey } from '@devhub/api-client';

function keysFor(event: ServerEvent): readonly (readonly string[])[] {
  switch (event.type) {
    case 'hello':
      return [];
    case 'status.changed':
      // Connecting or disconnecting a tool also changes its saved settings (specs 003 and 004), and which
      // tools the inbox shows (spec 007). A check that found Claude's login changed changes its card (spec 010).
      return [
        queryKeys.status,
        queryKeys.claudeLogin,
        queryKeys.jiraConnection,
        queryKeys.githubConnection,
        queryKeys.inbox,
        queryKeys.tickets,
        queryKeys.search,
      ];
    case 'sessions.changed':
      // A session waiting for approval is a row on Home (spec 007), a ticket's agent chip (spec 008), and a
      // search result (spec 009).
      return [queryKeys.sessions, queryKeys.inbox, queryKeys.tickets, queryKeys.search];
    case 'session.changed':
      // One session's steps changed: only its Session screen refetches (spec 011, AC-4).
      return [sessionQueryKey(event.sessionId)];
    case 'settings.changed':
      // The inbox rules apply when the server reads the list (spec 007).
      return [queryKeys.preferences, queryKeys.repositories, queryKeys.inbox];
    case 'inbox.changed':
      // A sync ended: Tickets' sprint syncs with the inbox (spec 008), and search reads both (spec 009).
      return [queryKeys.inbox, queryKeys.tickets, queryKeys.search];
  }
}
```

The switch has no `default`, so TypeScript refuses to compile until a new event type has a case.

`session.changed` names one session, so a working session refreshes its own Session screen and nothing else. The session service sends it at once, then at most every 250 ms per session while steps keep coming. A change of state or title also sends `sessions.changed`, and because a session's key (`['sessions', 'detail', id]`) starts with `queryKeys.sessions`, that refreshes the open Session screen too.

One exception sits in the subscriber: for `settings.changed`, a key with a change still on its way is skipped. That change refetches when it settles (`refetchAfterLast` in `features/settings/queries.ts`); refetching earlier could read the server before the change is written and flip the control back for a moment (spec 005 review).

TanStack Query then refetches only the queries that are on screen.

## Why invalidate instead of pushing data

- **One copy.** The query cache stays the only copy of server data; no store gets patched by hand.
- **Small events.** An event says _what_ changed, not the whole new value, so payloads stay tiny and the contract for each endpoint stays in one place.
- **Nothing to reconcile.** If the page missed an event (the stream reconnected), the next refetch is still correct.

Use `setQueryData` from an event only when the event carries the complete new value and the spec needs it on screen instantly, such as a streaming diff in a Claude session.

## Adding an event

1. Add a member to `ServerEventSchema`.
2. Publish it from the service in `packages/core`.
3. Map it to `invalidateQueries` in `packages/app/src/live-updates.tsx`.
4. Test the route with `app.inject()` (or a real stream in a route test) and the app mapping by publishing through a faked network stream (MSW).
