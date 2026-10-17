---
name: forms
description: Use whenever building or changing a form or any set of inputs that is submitted (connect Jira, add a repository, new ticket, inbox rules, composer). Forbids keeping input values in useState, validating by hand inside onSubmit, and inputs without a visible label.
---

# How to build a form

Every `<form>` uses react-hook-form with a zod schema. Settings save as you change them, so many settings forms submit on change rather than on a button.

## Steps

1. Write the zod schema in the feature's `schemas.ts`. If the server receives this data, reuse the request schema from `@devhub/contracts` instead of writing a second one (`jiraFormSchema` only extends `JiraConnectionRequestSchema`).
2. Call `useForm` with `zodResolver(schema)`.
3. Use `@devhub/ui` `Field` and `Input`: a visible label, and one help line that an error replaces.
4. Submit with a `useMutation` (`.claude/skills/server-state/SKILL.md`). Give the submit button `pending={mutation.isPending}` while it waits.
5. Show server errors next to the field they belong to, or in one line above the buttons.

```ts
// packages/app/src/features/settings/schemas.ts
export function jiraFormSchema(tokenRequired: boolean): z.ZodType<JiraCredentials, JiraFormValues> {
  // The contract's own request, so the form and the server refuse the same values with the same words.
  return JiraConnectionRequestSchema.extend({
    apiToken: tokenRequired ? JiraApiTokenSchema : JiraApiTokenOrBlankSchema,
  });
}
```

```tsx
// packages/app/src/features/settings/components/jira-connection-form.tsx (shortened)
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button, Field, Input } from '@devhub/ui';

const form = useForm<JiraFormValues, unknown, JiraCredentials>({ resolver: zodResolver(jiraFormSchema(true)) });
const { errors } = form.formState;

<form aria-label="Jira connection" noValidate onSubmit={(event) => void submit(event)}>
  <Field
    label="Jira site"
    help="The address you open Jira at, like your-team.atlassian.net."
    error={errors.site?.message}
  >
    <Input inputMode="url" autoCapitalize="none" spellCheck={false} {...form.register('site')} />
  </Field>
  {/* API token: <Input type="password" autoComplete="off" /> */}
  <Button type="submit" variant="primary" pending={connect.isPending}>
    Connect Jira
  </Button>
</form>;
```

`Field` gives its control the label, the help line and the error, wired with `aria-invalid` and `aria-describedby`; the error takes the help line's place. Give a button that stays on screen while it waits `pending`, never `disabled`, so it keeps focus and blocks a second submit. Put a server error on its field with `form.setError(name, { message }, { shouldFocus: true })` (Jira: `integration_rejected` on API token, `integration_unreachable` on Jira site), and anything else in one `role="alert"` line above the buttons.

## Rules

- Error messages say what to do, in the design system's voice ("Enter the address you open Jira at."), not "Invalid".
- Secrets (API tokens) use `type="password"` with `autoComplete="one-time-code"`, `data-1p-ignore` and `data-lpignore="true"`: browsers ignore `"off"` on a password and offer to save it as a sign-in. Secrets are never echoed back, never logged, and their mutation has `gcTime: 0`.
- `Enter` submits; a composer uses `Shift+Enter` for a new line.
- Buttons say what happens: "Connect Jira", "Add folder", never "Submit".

## Testing

Type into the real form with `userEvent`, find fields by label, submit, and assert the visible result. Fake only the network (MSW).

```ts
await user.type(screen.getByLabelText('Jira site'), 'your-team.atlassian.net');
await user.click(screen.getByRole('button', { name: 'Connect Jira' }));
expect(await screen.findByText('Connected')).toBeVisible();
```

## Don't

- Don't `const [site, setSite] = useState("")` for an input.
- Don't validate inside `onSubmit` by hand.
- Don't use a placeholder as the label.
- Don't write a second schema for data that already has a contract.

## Checked by

`/review` (a form-policy gate is planned) · `pnpm test packages/app`
