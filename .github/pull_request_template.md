## Spec

`specs/<NNN-slug>/` — <one line on what this PR delivers>

## What changed

- <the change, in the user's words>
- <packages touched>

## Screenshots (UI changes)

|         | Light               | Dark                |
| ------- | ------------------- | ------------------- |
| 360 px  | <!-- screenshot --> | <!-- screenshot --> |
| 1280 px | <!-- screenshot --> | <!-- screenshot --> |

## Done checklist

- [ ] The spec is written and every open question has an answer
- [ ] New code has honest tests, and coverage holds
- [ ] Every new `@devhub/ui` component has a story for each state and a test
- [ ] Every new screen was opened in a real browser (`pnpm dev`) at 360 px and 1280 px, in light and dark, with no layout shift while it loads
- [ ] There are no accessibility violations
- [ ] Every value comes from a token, and every screen has its `Design:` note
- [ ] `pnpm verify` passes, and the `/review` stamp matches this exact change

## Review

- Verdict: <pass | fail> · Model: <claude-opus-5-5> · Effort: <xhigh>
- Findings: <critical n · important n · suggestion n>
- Skipped rules (with the reason): <none>
