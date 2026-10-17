import { useEffect, useId, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { ApiRequestError } from '@devhub/api-client';
import type { JiraConnection, JiraCredentials } from '@devhub/contracts';
import { Button, Field, Input } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { useConnectJira, useDisconnectJira } from '../queries.ts';
import { jiraFormSchema, type JiraFormValues } from '../schemas.ts';

const apiTokensUrl = 'https://id.atlassian.com/manage-profile/security/api-tokens';

const tokenRequired = jiraFormSchema(true);
const tokenOptional = jiraFormSchema(false);

/** Where each server answer belongs; anything else goes in one line above the buttons. */
const fieldFor: Partial<Record<ApiRequestError['code'], keyof JiraFormValues>> = {
  integration_rejected: 'apiToken',
  integration_unreachable: 'site',
  // The only one the form can't catch itself: no token given, and none saved after all.
  bad_request: 'apiToken',
};

export interface JiraConnectionFormProps {
  id: string;
  /** What the server has saved; the form starts from it. */
  connection: JiraConnection;
  onConnected: () => void;
  onDisconnected: () => void;
  onCancel: () => void;
}

/** Settings › Connections › Jira: site, email and API token, checked with Jira before anything is saved (spec 003). */
export function JiraConnectionForm({ id, connection, onConnected, onDisconnected, onCancel }: JiraConnectionFormProps) {
  const platform = usePlatform();
  const connect = useConnectJira();
  const disconnect = useDisconnectJira();
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  const disconnectRef = useRef<HTMLButtonElement>(null);
  const confirmTitleId = useId();
  const confirmLineId = useId();
  const { saved, envToken } = connection;
  const form = useForm<JiraFormValues, unknown, JiraCredentials>({
    resolver: zodResolver(saved === null && !envToken ? tokenRequired : tokenOptional),
    defaultValues: { site: saved?.site ?? '', email: saved?.email ?? '', apiToken: '' },
  });
  const { errors } = form.formState;

  useEffect(() => {
    form.setFocus('site');
  }, [form]);

  // Focus moves into the confirm step when it opens, and back to Disconnect Jira when it is cancelled.
  const confirmShown = useRef(false);
  useEffect(() => {
    if (confirming) {
      confirmShown.current = true;
      confirmRef.current?.focus();
    } else if (confirmShown.current) {
      disconnectRef.current?.focus();
    }
  }, [confirming]);

  const submit = form.handleSubmit((values) => {
    connect.mutate(values, {
      onSuccess: onConnected,
      onError: (error) => {
        const field = fieldFor[error.code];
        if (field !== undefined) form.setError(field, { message: error.message }, { shouldFocus: true });
      },
    });
  });
  const formError =
    disconnect.error?.message ??
    (connect.error && fieldFor[connect.error.code] === undefined ? connect.error.message : undefined);

  const tokenLead =
    saved !== null
      ? 'Leave empty to keep the saved token.'
      : envToken
        ? 'Leave empty to use DEVHUB_JIRA_API_TOKEN from .env.'
        : 'Create one in your Atlassian account settings.';

  const tokenLink = (
    <a
      href={apiTokensUrl}
      rel="noreferrer"
      className="text-info underline"
      onClick={(event) => {
        event.preventDefault();
        platform.openExternal(apiTokensUrl);
      }}
    >
      Create an API token
    </a>
  );

  return (
    <form
      id={id}
      aria-label="Jira connection"
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-4"
    >
      <Field
        label="Jira site"
        help="The address you open Jira at, like your-team.atlassian.net."
        error={errors.site?.message}
      >
        <Input inputMode="url" autoCapitalize="none" spellCheck={false} {...form.register('site')} />
      </Field>
      <Field label="Email" help="The email you sign in to Jira with." error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...form.register('email')} />
      </Field>
      <Field
        label="API token"
        help={
          <>
            {tokenLead} {tokenLink}
          </>
        }
        // A refused token's message says to create a new one, so the link stays with it.
        error={
          errors.apiToken?.message === undefined ? undefined : (
            <>
              {errors.apiToken.message} {tokenLink}
            </>
          )
        }
      >
        {/* Browsers ignore autocomplete="off" on a password and offer to save it as a sign-in; they
            never save a one-time code, and the two attributes keep 1Password and LastPass away too. */}
        <Input
          type="password"
          autoComplete="one-time-code"
          data-1p-ignore
          data-lpignore="true"
          {...form.register('apiToken')}
        />
      </Field>
      {formError === undefined ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {formError}
        </p>
      )}
      {confirming ? (
        // Spec 003 Q3(c): the confirm step stays in the form, never a browser dialog.
        <div
          ref={confirmRef}
          role="group"
          aria-labelledby={confirmTitleId}
          aria-describedby={confirmLineId}
          tabIndex={-1}
          className="flex flex-col gap-2"
        >
          <span id={confirmTitleId} className="font-medium">
            Disconnect Jira?
          </span>
          <span id={confirmLineId} className="text-small text-muted-foreground">
            DevHub deletes the API token from your keychain and forgets the site and email.
          </span>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              variant="danger"
              pending={disconnect.isPending}
              onClick={() => {
                disconnect.mutate(undefined, { onSuccess: onDisconnected });
              }}
            >
              Disconnect
            </Button>
            <Button
              variant="ghost"
              // Once Disconnect is on its way, Cancel can't stop it.
              disabled={disconnect.isPending}
              onClick={() => {
                setConfirming(false);
                disconnect.reset();
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" pending={connect.isPending || form.formState.isSubmitting}>
            Connect Jira
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {saved === null ? null : (
            <Button
              ref={disconnectRef}
              variant="danger"
              size="sm"
              className="ms-auto"
              onClick={() => {
                connect.reset();
                setConfirming(true);
              }}
            >
              Disconnect Jira
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
