# Tasks: New ticket in Jira

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: The contract: a project's types, a new Jira ticket and its answer, two paths and their builders (AC-2, AC-9, AC-10, AC-11, AC-18)
      Check: pnpm test packages/contracts/src/jira-tickets.test.ts; pnpm typecheck
      Files: packages/contracts/src/jira-tickets.ts, packages/contracts/src/jira-tickets.test.ts, packages/contracts/src/routes.ts, packages/contracts/src/index.ts, packages/contracts/src/testing.ts
- [ ] Task 2: Jira's client: create metadata, create, add to sprint, and transitions by status id (AC-2, AC-4, AC-9, AC-11)
      Check: pnpm test packages/core/src/integrations/jira/client.test.ts
      Files: packages/core/src/integrations/jira/client.ts, packages/core/src/integrations/jira/client.test.ts, packages/core/src/test/fake-jira.ts
- [ ] Task 3: The tickets service makes a Jira ticket, adds it to the sprint and moves it to its column (AC-3, AC-6, AC-9, AC-10, AC-11)
      Check: pnpm test packages/core/src/tickets/tickets-service.test.ts
      Files: packages/core/src/tickets/tickets-service.ts, packages/core/src/tickets/tickets-service.test.ts
- [ ] Task 4: The routes: GET a project's types and POST a new Jira ticket, which starts a sprint pass (AC-2, AC-3, AC-18)
      Check: pnpm test packages/core/src/routes/tickets.test.ts; pnpm gate secrets
      Files: packages/core/src/routes/tickets.ts, packages/core/src/routes/tickets.test.ts, packages/core/src/create-server.ts
- [ ] Task 5: The API client: the project's types and a new Jira ticket, parsed with the contract (AC-2, AC-3)
      Check: pnpm test packages/api-client/src/jira-tickets.test.ts
      Files: packages/api-client/src/endpoints/tickets.ts, packages/api-client/src/client.ts, packages/api-client/src/queries.ts, packages/api-client/src/index.ts, packages/api-client/src/jira-tickets.test.ts
- [ ] Task 6: The form: Save in, Jira's types and priorities, their loading and failed states, and the due date by type (AC-2, AC-4, AC-5, AC-8, AC-13, AC-14, AC-15)
      Check: pnpm test packages/app/src/features/tickets/components/ticket-form.test.tsx
      Files: packages/app/src/features/tickets/components/ticket-form.tsx, packages/app/src/features/tickets/components/ticket-form.test.tsx, packages/app/src/features/tickets/schemas.ts, packages/app/src/features/tickets/ticket-words.ts, packages/app/src/features/tickets/queries.ts
- [ ] Task 7: The dialog and Tickets: Jira first, its line, made, made-but, refused and unreachable, and where New and + show (AC-1, AC-3, AC-6, AC-7, AC-9, AC-10, AC-11, AC-12)
      Check: pnpm test packages/app/src/features/tickets/components/new-ticket.test.tsx packages/app/src/features/tickets/tickets-screen.test.tsx
      Files: packages/app/src/features/tickets/components/new-ticket.tsx, packages/app/src/features/tickets/components/new-ticket.test.tsx, packages/app/src/features/tickets/tickets-screen.tsx, packages/app/src/features/tickets/tickets-screen.test.tsx, packages/app/src/features/tickets/ticket-words.ts
- [ ] Task 8: e2e: the dialog on Jira at 360 and 1280 px, in light and dark, with axe on each state (AC-16, AC-17)
      Check: pnpm test:e2e e2e/orynx-tickets.spec.ts
      Files: e2e/orynx-tickets.spec.ts, e2e/fake-tools (if the fake Jira needs the new endpoints)
- [ ] Task 9: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
