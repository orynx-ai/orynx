import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { JiraConnection, JiraCredentials } from '@devhub/contracts';
import { Button, Field, Input } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { useConnectJira, useDisconnectJira } from '../queries.ts';
import { jiraFormSchema, type JiraFormValues } from '../schemas.ts';

const apiTokensUrl = 'https://id.atlassian.com/manage-profile/security/api-tokens';

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
    resolver: zodResolver(jiraFormSchema(saved === null && !envToken)),
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
        // A refused token belongs to API token, an address that doesn't answer to Jira site.
        if (error.code === 'integration_rejected') {
          form.setError('apiToken', { message: error.message }, { shouldFocus: true });
        } else if (error.code === 'integration_unreachable') {
          form.setError('site', { message: error.message }, { shouldFocus: true });
        }
      },
    });
  });
  const fieldCodes = ['integration_rejected', 'integration_unreachable'];
  const formError =
    disconnect.error?.message ??
    (connect.error && !fieldCodes.includes(connect.error.code) ? connect.error.message : undefined);

  const tokenLead =
    saved !== null
      ? 'Leave empty to keep the saved token.'
      : envToken
        ? 'Leave empty to use DEVHUB_JIRA_API_TOKEN from .env.'
        : 'Create one in your Atlassian account settings.';

  return (
    <form
      id={id}
      aria-label="Jira connection"
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex max-w-md flex-col gap-4"
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
            {tokenLead}{' '}
            <a
              href={apiTokensUrl}
              className="text-info underline"
              onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                event.preventDefault();
                platform.openExternal(apiTokensUrl);
              }}
            >
              Create an API token
            </a>
          </>
        }
        error={errors.apiToken?.message}
      >
        <Input type="password" autoComplete="off" {...form.register('apiToken')} />
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
          <Button type="submit" variant="primary" pending={connect.isPending}>
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
