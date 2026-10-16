# Tasks: Repo foundation

- [x] Task 1: Root tooling: pnpm workspace, Turborepo, strict tsconfig base, ESLint, Prettier, `.env.example` (AC-3)
      Check: pnpm install; pnpm typecheck; pnpm lint
      Files: package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json, tsconfig.json, eslint.config.ts, prettier.config.ts, .env.example
- [x] Task 2: Handbook and decision docs (AC-13)
      Check: pnpm gate handbook-size
      Files: CLAUDE.md, docs/architecture.md, docs/feature-layout.md, docs/design-map.md, docs/product/spec.md, docs/design/**
- [x] Task 3: Contracts for status, events, sessions and API paths, with test builders (AC-8, AC-9)
      Check: pnpm test packages/contracts
      Files: packages/contracts/src/*
- [x] Task 4: Core server with the local-only plugin, status route and event stream (AC-6, AC-7, AC-9)
      Check: pnpm test packages/core
      Files: packages/core/src/*
- [x] Task 5: Node host: env config, runtime file with a per-start token, static web app in production (AC-1, AC-2)
      Check: pnpm test apps/server; pnpm start
      Files: apps/server/src/*
- [x] Task 6: API client: axios instance with the token header, status endpoint, query options, event stream (AC-8, AC-9)
      Check: pnpm test packages/api-client
      Files: packages/api-client/src/*
- [x] Task 7: Design system: tokens, Tailwind theme, first components with stories and tests (AC-10)
      Check: pnpm test packages/ui; pnpm gate component-coverage; pnpm gate style-policy
      Files: packages/ui/src/*
- [x] Task 8: App shell, the four routes, status and live updates; the web host with the token meta tag (AC-4, AC-5, AC-8, AC-9)
      Check: pnpm test packages/app; pnpm dev
      Files: packages/app/src/_, apps/web/_
- [x] Task 9: Gates with self-tests, the gate runner, the review stamp, Claude hooks and git hooks (AC-11, AC-12)
      Check: pnpm gates:test; pnpm gates
      Files: scripts/**, .husky/*, .claude/settings.json, commitlint.config.ts
- [x] Task 10: Skills, commands, helper agents, specs template, roadmap, engineering rules, learn pages, README (AC-13)
      Check: pnpm gate handbook-size; pnpm gate specs; pnpm gate learn-freshness
      Files: .claude/skills/**, .claude/commands/_, .claude/agents/_, specs/**, docs/product/roadmap.md, docs/engineering-rules.md, learn/*, README.md
- [x] Task 11: CI and e2e smoke test (AC-14)
      Check: pnpm test:e2e
      Files: .github/workflows/ci.yml, playwright.config.ts, e2e/*
- [x] Task 12: STOP and run /review
      Check: pnpm verify
