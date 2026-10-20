import { useEffect, useRef, type SubmitEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { ApiRequestError } from '@devhub/api-client';
import type { JiraConnection, JiraCredentials } from '@devhub/contracts';
import { ExternalLink, Field, Input } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import type { useConnectJira } from '../queries.ts';
import { jiraFormSchema, type JiraFormValues } from '../schemas.ts';

export const apiTokensUrl = 'https://id.atlassian.com/manage-profile/security/api-tokens';

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
  /** The form's id, which the dialog's Connect button submits. */
  id: string;
  /** What the server has saved; the form starts from it. */
  connection: JiraConnection;
  /** The dialog's Connect, so its button shows the check on its way and its answer lands after Cancel. */
  connect: ReturnType<typeof useConnectJira>;
  onConnected: () => void;
}

/** Settings › Connections › Jira: site, email and API token, checked with Jira before anything is saved (spec 003). Its buttons sit in the dialog's foot (spec 030). */
export function JiraConnectionForm({ id, connection, connect, onConnected }: JiraConnectionFormProps) {
  const platform = usePlatform();
  const { saved, envToken } = connection;
  const form = useForm<JiraFormValues, unknown, JiraCredentials>({
    resolver: zodResolver(saved === null && !envToken ? tokenRequired : tokenOptional),
    defaultValues: { site: saved?.site ?? '', email: saved?.email ?? '', apiToken: '' },
  });
  const { errors } = form.formState;

  // Straight to the element: react-hook-form's setFocus waits a tick, and focus could then land in
  // Jira site after the person has started typing elsewhere.
  const siteInput = useRef<HTMLInputElement | null>(null);
  const site = form.register('site');
  useEffect(() => {
    siteInput.current?.focus();
  }, []);

  // A second submit while the first is on its way sends nothing, even before the button shows it waits.
  const sending = useRef(false);
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    const done = () => {
      sending.current = false;
    };
    void form.handleSubmit((values) => {
      connect.mutate(values, {
        onSuccess: onConnected,
        onError: (error) => {
          const field = fieldFor[error.code];
          if (field !== undefined) form.setError(field, { message: error.message }, { shouldFocus: true });
        },
        onSettled: done,
      });
    }, done)(event);
  }
  const formError = connect.error && fieldFor[connect.error.code] === undefined ? connect.error.message : undefined;

  const tokenLead =
    saved !== null
      ? 'Leave empty to keep the saved token.'
      : envToken
        ? 'Leave empty to use DEVHUB_JIRA_API_TOKEN from .env.'
        : 'Create one in your Atlassian account settings.';

  return (
    <form id={id} aria-label="Jira connection" noValidate onSubmit={submit} className="flex flex-col gap-4">
      <Field
        label="Jira site"
        help="The address you open Jira at, like your-team.atlassian.net."
        error={errors.site?.message}
      >
        <Input
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          {...site}
          ref={(element) => {
            site.ref(element);
            siteInput.current = element;
          }}
        />
      </Field>
      <Field label="Email" help="The email you sign in to Jira with." error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...form.register('email')} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <Field label="API token" help={tokenLead} error={errors.apiToken?.message}>
          {/* Browsers ignore autocomplete="off" on a password and offer to save it as a sign-in. Chrome
              never saves a one-time code (Safari and Firefox: check by hand), and the two attributes keep
              1Password and LastPass away too. */}
          <Input
            type="password"
            autoComplete="one-time-code"
            data-1p-ignore
            data-lpignore="true"
            {...form.register('apiToken')}
          />
        </Field>
        {/* On a line of its own, so it stays whatever the field says, and no message gains a link it doesn't mean. */}
        <ExternalLink
          href={apiTokensUrl}
          className="self-start"
          onOpen={(href) => {
            platform.openExternal(href);
          }}
        >
          Create an API token
        </ExternalLink>
      </div>
      {formError === undefined ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {formError}
        </p>
      )}
    </form>
  );
}
