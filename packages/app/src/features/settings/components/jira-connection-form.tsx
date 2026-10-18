import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
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

  // Straight to the element: react-hook-form's setFocus waits a tick, and focus could then land in
  // Jira site after the person has started typing elsewhere.
  const siteInput = useRef<HTMLInputElement | null>(null);
  const site = form.register('site');
  useEffect(() => {
    siteInput.current?.focus();
  }, []);

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
  const formError =
    disconnect.error?.message ??
    (connect.error && fieldFor[connect.error.code] === undefined ? connect.error.message : undefined);

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
        <a
          href={apiTokensUrl}
          rel="noreferrer"
          className="self-start text-small text-info underline"
          onClick={(event) => {
            event.preventDefault();
            platform.openExternal(apiTokensUrl);
          }}
        >
          Create an API token
        </a>
      </div>
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
            Orynx deletes the API token from your keychain and forgets the site and email.
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
              aria-disabled={disconnect.isPending || undefined}
              onClick={() => {
                if (disconnect.isPending) return;
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
          {/* Once the check is on its way, closing the form can't stop it from saving. */}
          <Button
            variant="ghost"
            aria-disabled={connect.isPending || undefined}
            onClick={() => {
              if (!connect.isPending) onCancel();
            }}
          >
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
