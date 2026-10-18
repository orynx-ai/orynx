# Feature layout

Agents fill in a known shape far more reliably than they invent one. Every feature uses the shapes below. File names are kebab-case; React components are PascalCase exports.

## A screen feature in `packages/app`

```
packages/app/src/features/<feature>/
├── <feature>-screen.tsx        the route component; first line is the `// Design:` note
├── <feature>-screen.test.tsx   renders the real screen with MSW, asserts by role and text
├── components/                 pieces used only by this feature (a piece used twice moves to @devhub/ui)
│   ├── <piece>.tsx
│   └── <piece>.test.tsx
├── queries.ts                  hooks that wrap api-client queryOptions (useInbox, useTickets)
├── store.ts                    zustand store for this feature's UI-only state, if it needs one
└── schemas.ts                  zod schemas for this feature's forms, if any
```

- Routes are registered in `packages/app/src/router.tsx`, one `createRoute` per screen.
- Every screen handles four states: loading (skeleton built from the real chrome), empty, error and loaded. If a design does not show one of them, stop and ask.
- Shared app chrome (sidebar, page bar) lives in `packages/app/src/shell/`.
- Global UI stores (theme, sidebar) live in `packages/app/src/stores/`.
- Words and clocks more than one screen writes the same way (dates, waits, a tool's sync line, `useNow`) live in `packages/app/src/words/`.

## An API endpoint

```
packages/contracts/src/<area>.ts          request and response zod schemas, inferred types, path in routes.ts
packages/core/src/routes/<area>.ts        Fastify plugin; schema from contracts; no business logic inline
packages/core/src/routes/<area>.test.ts   app.inject() against the real server
packages/core/src/<area>/                 the service the route calls (integrations, storage)
packages/api-client/src/<area>.ts         typed function + queryOptions; parses with the contract
packages/api-client/src/<area>.test.ts    MSW handler built from the contract
```

## A design-system component in `packages/ui`

```
packages/ui/src/components/<name>.tsx          the component (shadcn base when one exists)
packages/ui/src/components/<name>.stories.tsx  one story per state and variant
packages/ui/src/components/<name>.test.tsx     behaviour and accessibility
packages/ui/src/index.ts                       export it
```

## An integration in `packages/core`

```
packages/core/src/integrations/<tool>/
├── client.ts         thin wrapper over the official SDK; the only file that talks to the network
├── map.ts            outside shapes → contracts shapes (pure, fully tested)
├── rules.ts          "needs you" rules for this tool alone (pure, fully tested); rules that combine
│                     tools, such as Home's inbox, live in packages/core/src/<area>/rules.ts
└── *.test.ts         network faked with MSW; never fake our own modules
```

## A spec

```
specs/<NNN>-<slug>/
├── spec.md    what and why, Given/When/Then acceptance criteria, out of scope, open questions
├── plan.md    order of work and risks
└── tasks.md   small steps, each with its check
```

Copy `specs/_template/`. Numbers follow `docs/product/roadmap.md`.
