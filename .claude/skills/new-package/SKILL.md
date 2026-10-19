---
name: new-package
description: Use when adding a new workspace package under packages/ or a new host under apps/ (for example apps/desktop). Forbids packages that skip the shared tsconfig, add a build step to an internal package, or import across the layering rules without updating the boundaries gate and docs/architecture.md.
---

# How to add a workspace package

Most work does not need a new package. Add one only when the spec calls for it or a person agrees (stop and ask). The current layering is in `docs/architecture.md`.

## Internal package (`packages/<name>`)

Internal packages have no build step: `exports` points at TypeScript source, and the consuming bundler (Vite, tsdown, tsx) compiles it.

1. Create the folder:

```
packages/<name>/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    └── index.ts
```

2. `package.json`:

```json
{
  "name": "@devhub/<name>",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc -p tsconfig.json" }
}
```

3. `tsconfig.json` extends the root strict base:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2023"], "types": [] },
  "include": ["src"]
}
```

Browser packages add `"lib": ["ES2023", "DOM", "DOM.Iterable"]` and `"jsx": "react-jsx"`. Node packages add `"types": ["node"]`.

4. Add dependencies with `pnpm --filter @devhub/<name> add <dep>`. Internal deps use `"@devhub/x": "workspace:*"`. Never edit `pnpm-lock.yaml` by hand.
5. Add the package to the root `vitest.config.ts` projects if it is not picked up by the glob.
6. Coverage threshold is 90%, like every other package.

## Host app (`apps/<name>`)

Hosts are the only things that build. A host mounts shared packages and supplies what differs per platform:

- Frontend: mount `<DevhubApp>` from `@devhub/app` and pass a `Platform` implementation (`packages/app/src/platform.tsx`). Never branch on the platform inside `@devhub/app`.
- Backend: call `createServer()` from `@devhub/core`, keep the token handshake and the 127.0.0.1 bind.
- Env config lives in `apps/<name>/src/config.ts` only, parsed with zod, every key in `.env.example`.

`apps/desktop` (Electron, spec 027) starts `apps/server`'s bundle instead of calling `createServer()` itself; see "The desktop app" in `docs/architecture.md`.

## Update the rules

1. Add the package and its allowed imports to the layering table in `scripts/gates/boundaries.ts` (or its policy in `scripts/lib/policies/`).
2. Add a row to the Packages table in `docs/architecture.md`, and to the Layout line in `CLAUDE.md` if agents need to know it exists.
3. If it is a browser package, it must not import `node:*` or server libraries.

## Check

```sh
pnpm install
pnpm typecheck
pnpm gate boundaries
pnpm test packages/<name>
```

## Don't

- Don't add `tsc --build` or `dist/` output to an internal package.
- Don't copy tsconfig options instead of extending `tsconfig.base.json`.
- Don't create a package to share two functions; put them in the package that owns the concept.

## Checked by

`pnpm gate boundaries` · `pnpm gate env-policy` · `pnpm typecheck`
