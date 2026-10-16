---
description: Write the spec for a feature (what, why, how we will know it works, open questions), then stop for answers
argument-hint: <roadmap spec number or a one-line description of the feature>
---

Write a spec for: $ARGUMENTS

1. Find the feature in `docs/product/roadmap.md`. Use its number and slug (`007-home-inbox`). If it is not on the roadmap, take the next free number and say so in the Assumptions.
2. Read what the feature depends on: its section of `docs/product/spec.md`, the screen reference in `docs/design/screens/`, the relevant parts of `docs/design/design-system.md`, `docs/architecture.md`, and the code it will touch.
3. Create the branch `feat/<NNN-slug>` from an up-to-date `main` if you are not already on it.
4. Copy `specs/_template/` to `specs/<NNN-slug>/` and fill in `spec.md`:
   - **Assumptions** at the top: every guess you are making (limits, wording, defaults), so a person can correct them in seconds.
   - **Goal**: two or three sentences in the user's words.
   - **Acceptance criteria**: a Given / When / Then table with IDs `AC-1`, `AC-2`, … Each row is one concrete situation, action and visible result. Cover the loading, empty and error states, keyboard use and both themes where the feature has UI. Tests will reuse these IDs.
   - **Out of scope**: what nobody asked for, so you do not build it.
   - **Open questions**: decisions only a person can make (Who decides / Question / Answer). Include every item from the "Stop and ask" list in `CLAUDE.md` that applies: missing components or tokens, design sources that disagree, states the design does not show, user-visible wording nobody gave, new dependencies.
   - **Design**: which file in `docs/design/screens/` and which part of it, or `none` with the reason.
   - Set `Status: draft`.
5. Leave `plan.md` and `tasks.md` as the template. `/plan` fills them.
6. Run `pnpm gate specs`.
7. **STOP.** Show the user the Assumptions and the Open questions and ask for answers. Do not write a plan or any code until every open question has an answer. When answers come, write each into the Answer column with the date, and set `Status: approved`.
