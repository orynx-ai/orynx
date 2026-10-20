import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import type { ApiRequestError } from '@devhub/api-client';
import type { GitHubConnection, GitHubCredentials, GitHubMethod } from '@devhub/contracts';
import { Button, ChoiceCard, ChoiceGroup, ExternalLink, Field, Input } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { useConnectGitHub, useDisconnectGitHub } from '../queries.ts';
import { githubFormSchema, type GitHubFormValues } from '../schemas.ts';

export const newTokenUrl = 'https://github.com/settings/tokens/new?scopes=repo&description=Orynx';

const tokenRequired = githubFormSchema(true);
const tokenOptional = githubFormSchema(false);

const tokenHelp =
  'Create a classic token with the repo scope. If your company uses single sign-on, authorize the token for it.';

/** Spec 004 Q6 (e): what Disconnect does, for the way that is saved. */
const disconnectLine: Record<GitHubMethod, string> = {
  gh: 'Orynx stops using your gh login. gh stays signed in.',
  token: 'Orynx deletes the token from your keychain.',
};

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
  id: string;
  /** What the server has saved; the form starts from it, and keeps that start while it is open. */
  connection: GitHubConnection;
  /** Says a message politely, for an error that lands where focus already is. */
  announce: (message: string) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onCancel: () => void;
}

/** Settings › Connections › GitHub: the gh login or a personal access token, checked with GitHub first (spec 004). */
export function GitHubConnectionForm({
  id,
  connection,
  announce,
  onConnected,
  onDisconnected,
  onCancel,
}: GitHubConnectionFormProps) {
  const platform = usePlatform();
  const connect = useConnectGitHub();
  const disconnect = useDisconnectGitHub();
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  const disconnectRef = useRef<HTMLButtonElement>(null);
  const confirmTitleId = useId();
  const confirmLineId = useId();
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

  // Focus moves into the confirm step when it opens, and back to Disconnect GitHub when it is cancelled.
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
    disconnect.error?.message ??
    (connect.error && fieldFor(connect.error, connect.variables.method) === undefined
      ? connect.error.message
      : undefined);

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
      {confirming && saved !== null ? (
        // Spec 004 Q4 (a), as Jira's: the confirm step stays in the form, never a browser dialog.
        <div
          ref={confirmRef}
          role="group"
          aria-labelledby={confirmTitleId}
          aria-describedby={confirmLineId}
          tabIndex={-1}
          className="flex flex-col gap-2"
        >
          <span id={confirmTitleId} className="font-medium">
            Disconnect GitHub?
          </span>
          <span id={confirmLineId} className="text-small text-muted-foreground">
            {disconnectLine[saved.method]}
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
              Disconnect GitHub
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
