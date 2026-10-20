import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import type { ApiRequestError } from '@devhub/api-client';
import type { GitHubConnection, GitHubCredentials, GitHubMethod } from '@devhub/contracts';
import { ChoiceCard, ChoiceGroup, ExternalLink, Field, Input } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import type { useConnectGitHub } from '../queries.ts';
import { githubFormSchema, type GitHubFormValues } from '../schemas.ts';

export const newTokenUrl = 'https://github.com/settings/tokens/new?scopes=repo&description=Orynx';

const tokenRequired = githubFormSchema(true);
const tokenOptional = githubFormSchema(false);

const tokenHelp =
  'Create a classic token with the repo scope. If your company uses single sign-on, authorize the token for it.';

/**
 * Where a server answer belongs: a refusal under what was refused (the token, or the gh choice), and
 * anything else, such as the network or the keychain, in one line above the buttons.
 */
function fieldFor(error: ApiRequestError, method: GitHubMethod): keyof GitHubFormValues | undefined {
  // The only one the form can't catch itself: no token given, and none saved after all.
  if (error.code === 'bad_request') return method === 'token' ? 'token' : undefined;
  if (error.code === 'integration_rejected') return method === 'gh' ? 'method' : 'token';
  return undefined;
}

export interface GitHubConnectionFormProps {
  /** The form's id, which the dialog's Connect button submits. */
  id: string;
  /** What the server has saved; the form starts from it, and keeps that start while it is open. */
  connection: GitHubConnection;
  /** The dialog's Connect, so its button shows the check on its way and its answer lands after Cancel. */
  connect: ReturnType<typeof useConnectGitHub>;
  /** Says a message politely, for an error that lands where focus already is. */
  announce: (message: string) => void;
  onConnected: () => void;
}

/**
 * Settings › Connections › GitHub: the gh login or a personal access token, checked with GitHub first (spec 004).
 * Its buttons sit in the dialog's foot (spec 030).
 */
export function GitHubConnectionForm({ id, connection, connect, announce, onConnected }: GitHubConnectionFormProps) {
  const platform = usePlatform();
  // What the server had saved when the form opened. A refetch while it is open (another tab, or this
  // Connect's own answer before the form closes) must not move focus or change what the form offers.
  const [{ saved, envToken, ghFound }] = useState(connection);
  // Manage starts from the saved way; Connect from gh when it is there.
  const startWith: GitHubMethod = saved?.method ?? (ghFound ? 'gh' : 'token');
  // The token may stay empty only when DevHub already has one: saved in the keychain, or in .env.
  const tokenKept = saved?.method === 'token' || envToken;
  const form = useForm<GitHubFormValues, unknown, GitHubCredentials>({
    resolver: zodResolver(tokenKept ? tokenOptional : tokenRequired),
    defaultValues: { method: startWith, token: '' },
  });
  const method = useWatch({ control: form.control, name: 'method' });
  const { errors } = form.formState;

  // Straight to the elements: react-hook-form can't focus one radio of a group, and its setFocus waits a tick.
  const radios = useRef<Partial<Record<GitHubMethod, HTMLInputElement | null>>>({});
  const tokenInput = useRef<HTMLInputElement | null>(null);
  const methodField = form.register('method');
  const tokenField = form.register('token');
  useEffect(() => {
    radios.current[startWith]?.focus();
  }, [startWith]);

  /**
   * Takes focus to where an error landed, so a screen reader reads the field and its new message. When
   * focus is already there (Enter pressed in that very place), nothing new would be read: say it instead.
   */
  function pointAt(element: HTMLInputElement | null | undefined, message: string) {
    if (element === document.activeElement) announce(message);
    else element?.focus();
  }

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
          const field = fieldFor(error, values.method);
          if (field === undefined) return;
          form.setError(field, { message: error.message });
          pointAt(field === 'token' ? tokenInput.current : radios.current[values.method], error.message);
        },
        onSettled: done,
      });
    }, done)(event);
  }
  const formError =
    connect.error && fieldFor(connect.error, connect.variables.method) === undefined
      ? connect.error.message
      : undefined;

  const tokenLead =
    saved?.method === 'token'
      ? 'Leave empty to keep the saved token.'
      : envToken
        ? 'Leave empty to use DEVHUB_GITHUB_TOKEN from .env.'
        : tokenHelp;

  function choice(value: GitHubMethod, title: string, detail: string) {
    return (
      <ChoiceCard
        value={value}
        title={title}
        detail={detail}
        {...methodField}
        ref={(element) => {
          methodField.ref(element);
          radios.current[value] = element;
        }}
      />
    );
  }

  return (
    <form id={id} aria-label="GitHub connection" noValidate onSubmit={submit} className="flex flex-col gap-4">
      <ChoiceGroup legend="Connect with" error={errors.method?.message}>
        {choice(
          'gh',
          'Use my gh login',
          ghFound
            ? 'Orynx asks the gh command-line tool for your token each time and keeps no copy.'
            : "gh isn't installed on this computer.",
        )}
        {choice('token', 'Use a personal access token', 'Orynx keeps the token in your keychain.')}
      </ChoiceGroup>
      {method === 'token' ? (
        <div className="flex flex-col gap-1.5">
          <Field label="Personal access token" help={tokenLead} error={errors.token?.message}>
            {/* Browsers ignore autocomplete="off" on a password and offer to save it as a sign-in; they
                never save a one-time code, and the two attributes keep 1Password and LastPass away too. */}
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
          {/* On a line of its own, so it stays whatever the field says. */}
          <ExternalLink
            href={newTokenUrl}
            className="self-start"
            onOpen={(href) => {
              platform.openExternal(href);
            }}
          >
            Create a token
          </ExternalLink>
        </div>
      ) : null}
      {formError === undefined ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {formError}
        </p>
      )}
    </form>
  );
}
