---
name: honest-tests
description: Use whenever writing or changing a test (unit, component, route, story or e2e), or when coverage drops. Forbids vi.mock of our own code or @devhub/*, data-testid, snapshot-only tests, .only, and tests that check a stand-in instead of the real thing.
---

# Honest tests

A test is the agent's proof that the code works. A test that passes while the feature is broken (a "false green") is worse than no test. Coverage stays at or above 90%, and it must come from real tests.

## The rules

1. **Never test a stand-in you made.** Never `vi.mock("./upload-button")` or `vi.mock("@devhub/ui")`.
2. **Fake only what we don't own:** the network (MSW), the clock (`vi.useFakeTimers()`), outside services. Use real components, the real design system, real stores, the real router.
3. **Find things the way a person does:** `getByRole`, `getByLabelText`, `getByText`. `data-testid` is banned.
4. **Check the words people see,** not internal keys or class names.
5. **Nothing worth testing? Don't invent a test.** Add the file to the coverage exclusions in that package's `vitest.config.ts` with a one-line reason.

## Fake test vs real test

```tsx
// ✖ Fake: tests its own stand-in. Always passes.
vi.mock('./connections-list', () => ({ ConnectionsList: () => <p>Connected</p> }));
it('shows connected', () => {
  render(<SettingsScreen />);
  expect(screen.getByText('Connected')).toBeVisible();
});
```

```tsx
// ✔ Real: the real app, the real screen, only the network faked.
import { apiRoutes } from '@devhub/contracts';
import { makeStatus } from '@devhub/contracts/testing';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { renderApp } from '../../test/render.tsx';
import { apiUrl, server } from '../../test/msw.ts';

it('AC-2: shows Jira as connected when the server says so', async () => {
  server.use(
    http.get(apiUrl(apiRoutes.status), () =>
      HttpResponse.json(makeStatus({ integrations: { jira: { state: 'connected', detail: null } } })),
    ),
  );
  await renderApp({ route: '/settings' }); // resolves once the shell is on screen
  expect(await screen.findByText('Jira')).toBeVisible();
  expect(screen.getByText('Connected')).toBeVisible(); // exact match, so "Not connected" does not count
});
```

Name tests after the acceptance criterion they prove (`AC-2: …`), so the spec and the tests line up.

## Which test where

| Code                                        | Test              | Tools                                                                                                         |
| ------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Pure functions (mappers, rules, formatters) | unit              | Vitest                                                                                                        |
| `@devhub/ui` components                     | component + story | Vitest, Testing Library, `userEvent`, `expectNoAxeViolations` from `@devhub/ui/testing`, Storybook a11y       |
| Screens in `@devhub/app`                    | component         | `await renderApp({ route })` from `packages/app/src/test/render.tsx`, MSW from `packages/app/src/test/msw.ts` |
| `@devhub/api-client`                        | unit              | MSW handlers returning `@devhub/contracts/testing` builders                                                   |
| `@devhub/core` routes                       | route             | `createServer()` + `app.inject()`; MSW for outside services; temp `DEVHUB_HOME`                               |
| Whole flows                                 | e2e               | Playwright in `e2e/`, real server + real web app                                                              |

## Every screen covers four states

Loading, empty, error, loaded. Make MSW return a delayed response, an empty list, a 500 and real data.

## jsdom limits

jsdom does no layout: every size is 0, and `toBeVisible()` does not prove an element is on screen. Check sizes, clipping and scrolling in a Storybook story or a Playwright test.

## e2e names read like acceptance criteria

```ts
test("Given DevHub is running, when I open it, then the sidebar shows Home, Tickets and Settings", async ({ page }) => { … });
```

## While working

- Run only what you touched: `pnpm test packages/app/src/features/settings`.
- `pnpm test:changed` runs tests related to files changed since `origin/main`.
- The full suite and coverage run in `pnpm verify` and CI.

## Don't

- Don't `vi.mock` a relative path or `@devhub/*`.
- Don't `getByTestId`, and don't add `data-testid` to components.
- Don't `toMatchSnapshot()`; assert the behaviour.
- Don't commit `it.only` or `describe.only`.
- Don't write a test just to raise coverage.

## Checked by

`pnpm gate test-policy` · vitest coverage thresholds (90%) · Storybook a11y (`test: "error"`) · the test-engineer agent during `/ship`
