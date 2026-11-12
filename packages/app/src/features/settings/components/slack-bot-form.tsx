import { useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { SlackBotRequestSchema, type SlackBotRequest } from '@devhub/contracts';
import { Button, Field, Input } from '@devhub/ui';
import { useConnectSlackBot, useDisconnectSlackBot } from '../queries.ts';

/**
 * Slack's bot token (spec 057, AC-14), under a connected Slack's details: a message your own token posts never notifies
 * you, so Orynx DMs Claude's questions as a bot. Checked with Slack before it's saved, and never shown again.
 */
export function SlackBotForm({ saved }: { saved: boolean }) {
  const connect = useConnectSlackBot();
  const remove = useDisconnectSlackBot();
  const form = useForm<SlackBotRequest>({
    resolver: zodResolver(SlackBotRequestSchema),
    defaultValues: { token: '' },
  });
  const tokenInput = useRef<HTMLInputElement | null>(null);
  const tokenField = form.register('token');

  if (saved) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-small">
        <span>Bot token saved</span>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Remove bot token"
          pending={remove.isPending}
          onClick={() => {
            remove.mutate();
          }}
        >
          Remove
        </Button>
        {remove.error ? (
          <p role="alert" className="m-0 w-full text-small text-danger">
            {remove.error.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      aria-label="Slack bot"
      noValidate
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        void form.handleSubmit((values) =>
          connect.mutateAsync(values).catch((error: unknown) => {
            form.setError('token', { message: (error as Error).message });
            tokenInput.current?.focus();
          }),
        )(event);
      }}
    >
      <Field
        label="Bot token (optional)"
        help="Lets Orynx message you. Starts with xoxb-."
        error={form.formState.errors.token?.message}
      >
        {/* As the other tokens: no password manager offers to keep it as a sign-in. */}
        <Input
          type="password"
          autoComplete="one-time-code"
          data-1p-ignore
          data-lpignore="true"
          {...tokenField}
          ref={(element) => {
            tokenField.ref(element);
            tokenInput.current = element;
          }}
        />
      </Field>
      <div>
        <Button type="submit" variant="secondary" size="sm" aria-label="Save bot token" pending={connect.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
