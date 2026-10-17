import { useEffect, useRef, type SubmitEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import type { ApiRequestError } from '@devhub/api-client';
import type { GitHubConnection, GitHubCredentials, GitHubMethod } from '@devhub/contracts';
import { Button, ChoiceCard, ChoiceGroup, Field, Input } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { useConnectGitHub } from '../queries.ts';
import { githubFormSchema, type GitHubFormValues } from '../schemas.ts';

const newTokenUrl = 'https://github.com/settings/tokens/new?scopes=repo&description=DevHub';

const tokenRequired = githubFormSchema(true);

/**
 * Where a server answer belongs: a refusal under what was refused (the token, or the gh choice), and
 * anything else, such as the network or the keychain, in one line above the buttons.
 */
function fieldFor(error: ApiRequestError, method: GitHubMethod): keyof GitHubFormValues | undefined {
  // The only one the form can't catch itself: no token given, and none saved after all.
  if (error.code === 'bad_request') return 'token';
  if (error.code === 'integration_rejected') return method === 'gh' ? 'method' : 'token';
  return undefined;
}

export interface GitHubConnectionFormProps {
  id: string;
  /** What the server has saved; the form starts from it. */
  connection: GitHubConnection;
  onConnected: () => void;
  onCancel: () => void;
}

/** Settings › Connections › GitHub: the gh login or a personal access token, checked with GitHub first (spec 004). */
export function GitHubConnectionForm({ id, connection, onConnected, onCancel }: GitHubConnectionFormProps) {
  const platform = usePlatform();
  const connect = useConnectGitHub();
  const { ghFound } = connection;
  const startWith: GitHubMethod = ghFound ? 'gh' : 'token';
  const form = useForm<GitHubFormValues, unknown, GitHubCredentials>({
    resolver: zodResolver(tokenRequired),
    defaultValues: { method: startWith, token: '' },
  });
  const method = useWatch({ control: form.control, name: 'method' });
  const { errors } = form.formState;

  // Straight to the elements: react-hook-form can't focus one radio of a group, and its setFocus waits a tick.
  const radios = useRef<Partial<Record<GitHubMethod, HTMLInputElement | null>>>({});
  const methodField = form.register('method');
  useEffect(() => {
    radios.current[startWith]?.focus();
  }, [startWith]);

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
          if (field === 'token') form.setError('token', { message: error.message }, { shouldFocus: true });
          if (field === 'method') {
            form.setError('method', { message: error.message });
            radios.current[values.method]?.focus();
          }
        },
        onSettled: done,
      });
    }, done)(event);
  }
  const formError =
    connect.error && fieldFor(connect.error, connect.variables.method) === undefined
      ? connect.error.message
      : undefined;

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
            ? 'DevHub asks the gh command-line tool for your token each time and keeps no copy.'
            : "gh isn't installed on this computer.",
        )}
        {choice('token', 'Use a personal access token', 'DevHub keeps the token in your keychain.')}
      </ChoiceGroup>
      {method === 'token' ? (
        <div className="flex flex-col gap-1.5">
          <Field
            label="Personal access token"
            help="Create a classic token with the repo scope. If your company uses single sign-on, authorize the token for it."
            error={errors.token?.message}
          >
            {/* Browsers ignore autocomplete="off" on a password and offer to save it as a sign-in; they
                never save a one-time code, and the two attributes keep 1Password and LastPass away too. */}
            <Input
              type="password"
              autoComplete="one-time-code"
              data-1p-ignore
              data-lpignore="true"
              {...form.register('token')}
            />
          </Field>
          {/* On a line of its own, so it stays whatever the field says. */}
          <a
            href={newTokenUrl}
            rel="noreferrer"
            className="self-start text-small text-info underline"
            onClick={(event) => {
              event.preventDefault();
              platform.openExternal(newTokenUrl);
            }}
          >
            Create a token
          </a>
        </div>
      ) : null}
      {formError === undefined ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" pending={connect.isPending}>
          Connect GitHub
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
      </div>
    </form>
  );
}
