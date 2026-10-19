# Plan: Your skills

Spec: `specs/023-your-skills/spec.md` (approved 19 Oct 2026)

## Order of work

Part A now, on this branch from `origin/main`:

1. **Contracts first**, so core, the client and the form share one shape: a skill, the folder-name rule and `folderFromName` (one pure function the form and the server both use), the limits, the paths, the `skills.changed` event and a `skill_rejected` error code, with builders in `@devhub/contracts/testing`.
2. **Core, the file.** `yaml` joins `@devhub/core` (Q12). `skill-file.ts` reads a `SKILL.md` into its frontmatter and instructions and writes one back, keeping frontmatter it doesn't know (AC-18). Pure, so it is tested alone.
3. **Core, the store.** `skill-store.ts` lists, reads, adds, saves (moving the folder on a rename), deletes and adds the starters under `<DEVHUB_HOME>/plugin/skills`: folders 0700, files 0600, a temporary file renamed into place, one change at a time, links skipped, 64 KB at most. Every change publishes `skills.changed`.
4. **Core, the routes.** `GET/POST /api/skills/orynx`, `PUT/DELETE /api/skills/orynx/:folder` and `POST /api/skills/orynx/starters` (022's `GET /api/skills` is the composer's `/` list), registered in `create-server.ts`. A refused name is a `SkillRejectedError`, which the `/api` error handler answers with 422.
5. **API client.** Endpoints, `ApiClient` methods and `queryOptions`; `skills.changed` invalidates them in `live-updates.tsx`.
6. **UI parts**, before the screen that uses them: `ListNav`, a `mono` Textarea and a `skill` SourceMark, each with a story per state and a test.
7. **App.** The Skills tab after Coding agent; the page bar's count and New skill; the loading, error and empty states; the list with search; the editor form (react-hook-form and zod); New skill, rename, delete and discard; the starters and the Bug bash callout; unreadable skills.
8. **E2e and the browser check**: one flow on a hub of its own, then the screen at 360 and 1280 px in both themes with `/api` faked.

Part B, after 022 merges into `main` (Q5): merge `origin/main`, then your skills in 022's `/` list and brief, the use counts, Try in a new session, and Part B's e2e. Its tasks are refined against 022's code once it lands.

## Risks

| Risk                                                       | How we will notice early                                           | What we do                                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Two saves race on a rename, and both take the same folder  | A store test saves two skills to one name at once                  | Check the name inside the one-at-a-time queue, then `rename` the folder                                                          |
| A hand-written `SKILL.md` breaks the list                  | Store tests with bad YAML, no frontmatter, a 65 KB file and a link | Any of them reads as "Orynx can't read this skill.", never an error page                                                         |
| A folder from a URL escapes the skills folder              | Route tests send `../x`, `Bug Bash` and a link                     | The rule refuses it before the disk, and the resolved path must sit inside the skills folder                                     |
| `useBlocker` (new to this app) misses a way out of the tab | The Discard test leaves through the router's real navigation       | Block in-app navigation and the window closing, test both                                                                        |
| Merging 022 conflicts in shared files                      | Task 18                                                            | Each addition to `index.ts`, `routes.ts`, `create-server.ts`, `architecture.md` and core's `package.json` stays in its own lines |
| 022 lands differently from its spec                        | Task 18's merge                                                    | Rewrite tasks 19 to 23 against the merged code before building them                                                              |

## Touches

- Packages: contracts, core, api-client, ui, app, e2e; new dependency `yaml` in core (Q12), listed in `docs/architecture.md`
- Gates that check this work: boundaries, style-policy, design-source, component-coverage, icon-buttons, test-policy, secrets, specs; Storybook a11y; coverage at 90%
- Skills to follow: `add-api-endpoint`, `server-state`, `add-ui-component`, `build-a-screen`, `clean-ui`, `forms`, `client-state`, `honest-tests`
