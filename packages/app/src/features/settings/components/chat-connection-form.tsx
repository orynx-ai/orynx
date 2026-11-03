import { useEffect, useRef, useState, type ReactNode, type SubmitEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { ApiRequestError } from '@devhub/api-client';
import { Field, Input } from '@devhub/ui';
import { chatFormSchema, type ChatFormValues } from '../schemas.ts';

/** Words for each tool's step 2 (spec 016, Q8). */
const words = {
  slack: {
    label: 'Paste your Slack token',
    help: 'The User OAuth Token from your Slack app, starting xoxp-',
    env: 'DEVHUB_SLACK_USER_TOKEN',
    form: 'Slack connection',
  },
  discord: {
    label: "Paste your bot's token",
    help: "The token from your bot's page in the Developer Portal.",
    env: 'DEVHUB_DISCORD_BOT_TOKEN',
    form: 'Discord connection',
  },
} as const;

export interface ChatConnectionFormProps {
  tool: 'slack' | 'discord';
  /** The form's id, which the dialog's Connect button submits. */
  id: string;
  /** Step 1: what to set up before the token exists. */
  first: ReactNode;
  /** Orynx has a token already, saved or in `.env`, so the field may stay empty. */
  saved: boolean;
  envToken: boolean;
  /** Checks and saves; rejects with an ApiRequestError whose code says where it belongs. */
  send: (request: { token?: string | undefined; userId?: string | undefined }) => Promise<unknown>;
  onConnected: () => void;
}

/**
 * Settings › Connections › Slack or Discord (spec 016, A): step 1, then the token, checked with the tool before
 * anything is saved. A team's Discord bot asks for your user ID too (AC-8). Its buttons sit in the dialog's foot.
 */
export function ChatConnectionForm({ tool, id, first, saved, envToken, send, onConnected }: ChatConnectionFormProps) {
  const said = words[tool];
  const [askUserId, setAskUserId] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const form = useForm<ChatFormValues, unknown, { token?: string | undefined; userId?: string | undefined }>({
    resolver: zodResolver(chatFormSchema(tool, { tokenKept: saved || envToken, askUserId })),
    defaultValues: { token: '', userId: '' },
  });
  const { errors } = form.formState;
  const tokenInput = useRef<HTMLInputElement | null>(null);
  const tokenField = form.register('token');
  // The user ID field takes focus as it appears, so a screen reader says why it's there (AC-8).
  useEffect(() => {
    if (askUserId) form.setFocus('userId');
  }, [askUserId, form]);
  // A second submit while the first is on its way sends nothing.
  const sending = useRef(false);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    const done = () => {
      sending.current = false;
    };
    setProblem(null);
    void form.handleSubmit(async (values) => {
      try {
        await send(values);
        onConnected();
      } catch (error) {
        const failure = error as ApiRequestError;
        if (failure.code === 'user_id_needed') {
          setAskUserId(true);
        } else if (failure.code === 'integration_rejected' || failure.code === 'bad_request') {
          form.setError('token', { message: failure.message });
          tokenInput.current?.focus();
        } else {
          setProblem(failure.message);
        }
      } finally {
        done();
      }
    }, done)(event);
  }

  const help = saved
    ? 'Leave empty to keep the saved token.'
    : envToken
      ? `Leave empty to use ${said.env} from .env.`
      : said.help;
  return (
    <form id={id} aria-label={said.form} noValidate onSubmit={submit} className="flex flex-col gap-4">
      {first}
      <Field label={said.label} help={help} error={errors.token?.message}>
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
      {askUserId ? (
        <Field
          label="Your Discord user ID"
          help="A team owns this bot. In Discord, turn on Developer Mode, then right-click your name › Copy User ID."
          error={errors.userId?.message}
        >
          <Input inputMode="numeric" autoComplete="off" {...form.register('userId')} />
        </Field>
      ) : null}
      {problem === null ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {problem}
        </p>
      )}
    </form>
  );
}
