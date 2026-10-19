import { useId, useRef, type SubmitEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button, EmptyState, Field, Input } from '@devhub/ui';
import { useChangePreferences, usePreferences } from '../queries.ts';
import { allowedCommandFormSchema, type AllowedCommandFormValues } from '../schemas.ts';
import { SaveError } from './save-error.tsx';

/**
 * Settings › Coding agent's allow list (spec 012, Q6, Q8f): the commands that run without asking while Run
 * commands is Only allowed commands (spec 026). Shown whatever it's set to, so it can be filled first. Adding and
 * removing save one entry each, shown at once; a change that fails is taken back alone.
 */
export function AllowedCommands() {
  const preferences = usePreferences();
  const change = useChangePreferences();
  const saved = preferences.data?.allowedCommands;
  const headingId = useId();
  const form = useForm<AllowedCommandFormValues, unknown, { command: string }>({
    // Read again on every check, so "already on the list" counts what's on screen now.
    resolver: (values, context, options) =>
      zodResolver(allowedCommandFormSchema(saved ?? []))(values, context, options),
    defaultValues: { command: '' },
  });
  const { errors } = form.formState;
  const field = form.register('command');
  const input = useRef<HTMLInputElement | null>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());

  function add(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.handleSubmit(({ command }) => {
      change.mutate({ allowCommand: command });
      form.reset();
      input.current?.focus();
    })(event);
  }

  function remove(entry: string, next: string | undefined) {
    // Focus moves on before the row goes, so it never falls back to the page.
    const target = next === undefined ? input.current : (removeButtons.current.get(next) ?? null);
    target?.focus();
    change.mutate({ disallowCommand: entry });
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="m-0 text-body font-medium">
          Allowed commands
        </h2>
        <p className="m-0 text-small text-muted-foreground">
          These run without asking while Run commands is set to Only allowed commands. Commands run in a sandbox with no
          network.
        </p>
      </div>
      {saved === undefined ? (
        // While the list loads: its frame, one row tall, so the tab doesn't open on a blank.
        <div aria-hidden className="h-14 rounded-md border border-border bg-raised" />
      ) : saved.length === 0 ? (
        <EmptyState title="No commands yet">
          <span>Add one here, or press Always allow when Claude asks.</span>
        </EmptyState>
      ) : (
        <ul
          aria-label="Allowed commands"
          className="m-0 list-none divide-y divide-border rounded-md border border-border bg-raised p-0"
        >
          {saved.map((entry, index) => (
            <li key={entry} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 grow font-mono text-code wrap-anywhere">{entry}</span>
              <Button
                ref={(element) => {
                  if (element === null) removeButtons.current.delete(entry);
                  else removeButtons.current.set(entry, element);
                }}
                variant="ghost"
                size="sm"
                aria-label={`Remove ${entry}`}
                // Removing moves focus to the next row's Remove, so a held-down Enter would remove one after another.
                onKeyDown={(event) => {
                  if (event.repeat) event.preventDefault();
                }}
                onClick={() => {
                  remove(entry, saved[index + 1]);
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {change.isError ? <SaveError /> : null}
      <form aria-label="Add an allowed command" noValidate className="flex items-start gap-2" onSubmit={add}>
        <Field label="Command" error={errors.command?.message} className="min-w-0 grow">
          <Input
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="font-mono"
            {...field}
            ref={(element) => {
              field.ref(element);
              input.current = element;
            }}
          />
        </Field>
        {/* Level with the field: under its 20 px label and the 6 px gap. */}
        <Button type="submit" variant="secondary" className="mt-6.5">
          Add
        </Button>
      </form>
    </section>
  );
}
