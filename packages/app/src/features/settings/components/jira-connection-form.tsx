import { useEffect, type MouseEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { JiraConnection, JiraCredentials } from '@devhub/contracts';
import { Button, Field, Input } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { useConnectJira } from '../queries.ts';
import { jiraFormSchema, type JiraFormValues } from '../schemas.ts';

const apiTokensUrl = 'https://id.atlassian.com/manage-profile/security/api-tokens';

export interface JiraConnectionFormProps {
  id: string;
  /** What the server has saved; the form starts from it. */
  connection: JiraConnection;
  onConnected: () => void;
  onCancel: () => void;
}

/** Settings › Connections › Jira: site, email and API token, checked with Jira before anything is saved (spec 003). */
export function JiraConnectionForm({ id, connection, onConnected, onCancel }: JiraConnectionFormProps) {
  const platform = usePlatform();
  const connect = useConnectJira();
  const { saved, envToken } = connection;
  const form = useForm<JiraFormValues, unknown, JiraCredentials>({
    resolver: zodResolver(jiraFormSchema(saved === null && !envToken)),
    defaultValues: { site: saved?.site ?? '', email: saved?.email ?? '', apiToken: '' },
  });
  const { errors } = form.formState;

  useEffect(() => {
    form.setFocus('site');
  }, [form]);

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
  const formError = connect.error && !fieldCodes.includes(connect.error.code) ? connect.error.message : undefined;

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
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" pending={connect.isPending}>
          Connect Jira
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
