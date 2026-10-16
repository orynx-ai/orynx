---
name: write-a-gate
description: Use when a rule matters enough that a program must check it, when something broke that the checks missed, or when changing an existing gate in scripts/gates/. Forbids gates without a self-test, gates that pass quietly when their setup is broken, unclear output, and turning a new rule on as failing before old code is fixed.
---

# How to write a gate

A gate is a small program that checks one rule across the code and stops the work when the rule is broken. Gates turn the handbook's rules into something real: a rule written only in a document will be broken sooner or later.

## Where things live

```
scripts/gates/<id>.ts         one rule per file
scripts/gates/<id>.test.ts    a test for the gate itself (node:test)
scripts/lib/policies/*.ts     pure rule functions shared by a gate and a Claude hook
scripts/run-gates.ts          runs every gate at once, after the gates' own tests
```

Gates are TypeScript run by plain `node` (type stripping), so use erasable syntax only (no `enum`, no parameter properties), `.ts` extensions in relative imports, and only Node built-ins.

## Steps

1. **Name the rule** in one sentence and pick a kebab-case id (`form-policy`).
2. **Write the pure check** in `scripts/lib/policies/<id>.ts`: input is a path and its text, output is a list of findings. Keeping it pure means a hook can reuse it, so the hook and the gate always agree.
3. **Write the gate** in `scripts/gates/<id>.ts`: list the files in scope, call the policy, return findings. Register it in `scripts/run-gates.ts`.
4. **Write the self-test** in `scripts/gates/<id>.test.ts`: one passing fixture, one failing fixture per finding kind, one ignore-comment case. Build any fake secret at runtime (string concatenation) so the secrets gate does not flag the test.
5. **Start soft.** A new gate first runs in `warn` mode so old code is not blocked overnight. Fix the old code, then switch it to `fail`.
6. **Link it.** Add `Checked by: pnpm gate <id>` to the rule in `CLAUDE.md` (inside the agent-rules block), then run `pnpm agent-rules`. Put the ticket or spec number in a comment at the top of the gate so nobody removes it by mistake.

## Output must say what to fix

Every finding has the file, the line, the rule, what is wrong, and how to fix it:

```
✖ style-policy
  packages/app/src/features/home/home-screen.tsx:42
  raw-colour: "#3b5bdb" is a raw colour
  fix: use a theme class from docs/design-map.md (text-info)
```

The agent reads this message and fixes the code on its own, so the fix line matters most.

## Fail when the setup is broken

If the gate cannot do its job (it cannot find the main branch, a file it needs is missing, git fails), it must fail, never quietly pass.

## The rare exception

A rule may be switched off for one line, with a reason after the colon. No reason, no exception:

```ts
// style-policy-ignore-next-line: 22 px pill height from components.css .dh-pill
```

## Hooks

A Claude hook (`scripts/claude-hooks/`) catches the same mistake while the agent is editing. Rules for hooks:

- Use the gate's own policy function.
- If the hook itself breaks, exit 0 and let the work continue. The gate is the safety net.
- Test the hook's decision function like any other code.

## Run it

```sh
pnpm gates:test         # every gate's self-test
pnpm gate <id>          # one gate
pnpm gates              # every gate in parallel (also runs in pre-push and CI)
```

## Don't

- Don't check two rules in one gate.
- Don't print only "failed".
- Don't add an npm dependency to a gate.
- Don't make a gate slow: the whole push run should stay under about 30 seconds.

## Checked by

`pnpm gates:test` · CI runs every gate on each PR
