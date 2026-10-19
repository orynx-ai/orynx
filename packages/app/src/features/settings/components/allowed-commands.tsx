import { useId, useRef, type SubmitEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { CommandLineIcon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { useForm } from 'react-hook-form';
import { Button, ContextChip, Field, Icon, Input, Panel, Pill, Skeleton } from '@devhub/ui';
import { useChangePreferences, usePreferences } from '../queries.ts';
import { permissionRows } from '../permission-levels.ts';
import { allowedCommandFormSchema, type AllowedCommandFormValues } from '../schemas.ts';
import { SaveError } from './save-error.tsx';

/** Whether the list counts right now, from how Run commands is set. */
function usageLine(commands: string): string {
  if (commands === 'allowed_list') return 'In use: Run commands is set to Allowed only';
  const label = permissionRows.commands.choices.find((choice) => choice.value === commands)?.label ?? commands;
  return `Not in use: Run commands is set to ${label}`;
}

/**
 * Settings › Coding agent's allow list (spec 012, Q6, Q8f): the commands that run without asking while Run
 * commands is Allowed only (spec 026), drawn as the redesign's panel of chips (19 Oct 2026). Shown whatever Run
 * commands is set to, so it can be filled first, and its head says whether it's in use. Adding and removing save
 * one entry each, shown at once; a change that fails is taken back alone.
 */
export function AllowedCommands() {
  const preferences = usePreferences();
  const change = useChangePreferences();
  const saved = preferences.data?.allowedCommands;
  const commands = preferences.data?.permissions.commands;
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

  function add(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.handleSubmit(({ command }) => {
      change.mutate({ allowCommand: command });
      form.reset();
      input.current?.focus();
    })(event);
  }

  return (
    <Panel aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-sidebar px-4 py-3">
        <Icon icon={CommandLineIcon} aria-hidden className="text-muted-foreground" />
        <h2 id={headingId} className="m-0 text-body font-medium">
          Allowed commands
        </h2>
        {saved === undefined ? null : <Pill plain>{saved.length}</Pill>}
        {commands === undefined ? null : (
          <span className="ms-auto text-small text-muted-foreground">{usageLine(commands)}</span>
        )}
      </div>
      <div className="flex flex-col gap-3 px-4 py-3.5">
        <p className="m-0 text-small text-muted-foreground">
          Run without asking, inside the sandbox with no network. You can also add one by pressing Always allow when
          Claude asks.
        </p>
        {saved === undefined ? (
          // While the list loads: one chip's height, so the tab doesn't jump when it comes.
          <span aria-hidden className="flex h-8 items-center">
            <Skeleton className="h-6 w-40" />
          </span>
        ) : saved.length === 0 ? (
          <p className="m-0 flex h-8 items-center text-small">No commands yet.</p>
        ) : (
          <ul aria-label="Allowed commands" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {saved.map((entry, index) => (
              <ContextChip
                key={entry}
                label={entry}
                className="max-w-full font-mono"
                // Removing moves focus to the next chip's remove, so a held-down Enter would remove one after another.
                onKeyDown={(event) => {
                  if (event.repeat) event.preventDefault();
                }}
                onRemove={() => {
                  // The chip moves focus to the next chip's remove; after the last one, the field takes it.
                  if (saved[index + 1] === undefined) input.current?.focus();
                  change.mutate({ disallowCommand: entry });
                }}
              />
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
              placeholder="npm test"
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
            <Icon icon={PlusSignIcon} aria-hidden />
            Add
          </Button>
        </form>
      </div>
    </Panel>
  );
}
