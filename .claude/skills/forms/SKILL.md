---
name: forms
description: Use whenever building or changing a form or any set of inputs that is submitted (connect Jira, add a repository, new ticket, inbox rules, composer). Forbids keeping input values in useState, validating by hand inside onSubmit, and inputs without a visible label.
---

# How to build a form

Every `<form>` uses react-hook-form with a zod schema. Settings save as you change them, so many settings forms submit on change rather than on a button.

## Steps

1. Write the zod schema in the feature's `schemas.ts`. If the server receives this data, reuse the request schema from `@devhub/contracts` instead of writing a second one.
2. Call `useForm` with `zodResolver(schema)`.
3. Use `@devhub/ui` inputs. Each input has a visible `<label>`; help text sits under it in `text-small text-muted-foreground`.
4. Submit with a `useMutation` (`.claude/skills/server-state/SKILL.md`). Disable the submit button while it is pending.
5. Show server errors next to the field they belong to, or in one line above the buttons.

```tsx
// packages/app/src/features/settings/schemas.ts
import { z } from 'zod';

export const jiraConnectionSchema = z.object({
  site: z.string().min(1, 'Enter the address you open Jira at.'),
  email: z.email('Enter the email you sign in to Jira with.'),
  apiToken: z.string().min(1, 'Paste your Jira API token.'),
});
export type JiraConnectionForm = z.infer<typeof jiraConnectionSchema>;
```

```tsx
// packages/app/src/features/settings/components/jira-connection-form.tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@devhub/ui';
import { useForm } from 'react-hook-form';
import { jiraConnectionSchema, type JiraConnectionForm } from '../schemas.ts';

export function JiraConnectionFormFields({ onSubmit }: { onSubmit: (values: JiraConnectionForm) => void }) {
  const form = useForm<JiraConnectionForm>({ resolver: zodResolver(jiraConnectionSchema) });
  const { errors, isSubmitting } = form.formState;
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <label htmlFor="jira-site">Jira site</label>
      <input
        id="jira-site"
        aria-invalid={errors.site ? true : undefined}
        aria-describedby="jira-site-help"
        {...form.register('site')}
      />
      <span id="jira-site-help">{errors.site?.message ?? 'The address you open Jira at.'}</span>
      {/* email and apiToken the same way, apiToken with type="password" and autoComplete="off" */}
      <Button type="submit" variant="primary" disabled={isSubmitting}>
        Connect Jira
      </Button>
    </form>
  );
}
```

Replace the raw `<label>`, `<input>` and help `<span>` with the `@devhub/ui` Input/Field components once spec 006 builds them; until then, add the component through `.claude/skills/add-ui-component/SKILL.md`.

## Rules

- Error messages say what to do, in the design system's voice ("Enter the address you open Jira at."), not "Invalid".
- Secrets (API tokens) use `type="password"` and `autoComplete="off"`, are never echoed back, and are never logged.
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
