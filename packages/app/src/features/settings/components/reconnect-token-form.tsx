import { useRef, useState, type SubmitEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ApiRequestError } from '@devhub/api-client';
import { ExternalLink, Field, Input } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import type { jiraReconnectSchema, ReconnectTokenValues } from '../schemas.ts';

export interface ReconnectTokenFormProps {
  /** The form's id, which the dialog's Reconnect button submits. */
  id: string;
  /** The field's name: "API token". */
  label: string;
  /** Jira's or GitHub's token rule; both read the same shape. */
  schema: typeof jiraReconnectSchema;
  /** Where to make a new token, and the link's words. */
  createUrl: string;
  createLabel: string;
  /** Checks and saves the token, or tries the saved one again when it's undefined. */
  send: (token: string | undefined) => Promise<unknown>;
  onReconnected: () => void;
}

/**
 * Needs reconnecting with a token (spec 030, Q3): one field for a new token, sent with what is saved, so
 * Jira keeps its site and email. A refusal goes under the field; anything else, such as the network, under it all.
 */
export function ReconnectTokenForm({
  id,
  label,
  schema,
  createUrl,
  createLabel,
  send,
  onReconnected,
}: ReconnectTokenFormProps) {
  const platform = usePlatform();
  const [problem, setProblem] = useState<string | null>(null);
  const form = useForm<ReconnectTokenValues, unknown, { token?: string | undefined }>({
    resolver: zodResolver(schema),
    defaultValues: { token: '' },
  });

  // A second submit while the first is on its way sends nothing.
  const sending = useRef(false);
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setProblem(null);
    void form.handleSubmit(
      async ({ token }) => {
        try {
          await send(token);
          onReconnected();
        } catch (error) {
          const refused =
            error instanceof ApiRequestError && (error.code === 'integration_rejected' || error.code === 'bad_request');
          if (refused) form.setError('token', { message: error.message }, { shouldFocus: true });
          else setProblem(error instanceof Error ? error.message : 'Reconnecting failed.');
        } finally {
          sending.current = false;
        }
      },
      () => {
        sending.current = false;
      },
    )(event);
  }

  return (
    <form id={id} aria-label="Reconnect" noValidate onSubmit={submit} className="flex flex-col gap-1.5">
      <Field
        label={label}
        help="Paste a new token, or leave this empty to try the saved one again."
        error={form.formState.errors.token?.message}
      >
        {/* As Connect's token fields: no browser or password manager offers to save it as a sign-in. */}
        <Input
          type="password"
          autoComplete="one-time-code"
          data-1p-ignore
          data-lpignore="true"
          {...form.register('token')}
        />
      </Field>
      <ExternalLink
        href={createUrl}
        className="self-start"
        onOpen={(href) => {
          platform.openExternal(href);
        }}
      >
        {createLabel}
      </ExternalLink>
      {problem === null ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {problem}
        </p>
      )}
    </form>
  );
}
