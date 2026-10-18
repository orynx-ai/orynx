import { useRef, type SubmitEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from '@tanstack/react-router';
import { useForm, useWatch } from 'react-hook-form';
import type { Session } from '@devhub/contracts';
import { Composer, ComposerBar, ComposerHint, ComposerSend, ComposerTextarea } from '@devhub/ui';
import { cannotSendLine, followUpBox, followUpOffLine, sendFailedLine } from '../follow-up-words.ts';
import { useSendMessage } from '../queries.ts';
import { followUpFormSchema, type FollowUpFormValues } from '../schemas.ts';
import { sourceLabel } from '../source-label.ts';
import { useSessionDrafts } from '../store.ts';

function FollowUpForm({ session, keyName }: { session: Session; keyName: string }) {
  const draft = useSessionDrafts((state) => state.drafts[session.id] ?? '');
  const setDraft = useSessionDrafts((state) => state.setDraft);
  const clearDraft = useSessionDrafts((state) => state.clearDraft);
  const send = useSendMessage(session.id);
  const form = useForm<FollowUpFormValues, unknown, { text: string }>({
    resolver: zodResolver(followUpFormSchema),
    defaultValues: { text: draft },
  });
  const box = useRef<HTMLTextAreaElement | null>(null);
  const field = form.register('text', {
    onChange: (event: { target: { value: string } }) => {
      setDraft(session.id, event.target.value);
      // What was said about the last try no longer fits once you change the text.
      if (send.isError || send.data !== undefined) send.reset();
    },
  });
  const canSend = useWatch({ control: form.control, name: 'text' }).trim() !== '';
  const refused = send.data?.result === 'cannot_send' ? cannotSendLine(send.data.reason, keyName) : null;
  const said = form.formState.errors.text?.message ?? (send.isError ? sendFailedLine : refused);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.handleSubmit(({ text }) => {
      send.mutate(text, {
        onSuccess: (answer) => {
          if (answer.result !== 'sent') return;
          form.reset({ text: '' });
          clearDraft(session.id);
          box.current?.focus();
        },
      });
    })(event);
  }

  return (
    <div className="flex flex-col gap-2">
      <Composer look="follow-up" canSend={canSend} pending={send.isPending} onSubmit={submit}>
        <ComposerTextarea
          label={followUpBox.label}
          placeholder={followUpBox.placeholder}
          {...field}
          ref={(element) => {
            field.ref(element);
            box.current = element;
          }}
        />
        <ComposerBar>
          <ComposerHint>{followUpBox.hint}</ComposerHint>
          <ComposerSend label={followUpBox.send} />
        </ComposerBar>
      </Composer>
      {said == null ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {said}
        </p>
      )}
    </div>
  );
}

/**
 * The follow-up box at the end of Claude's progress (spec 013, Q1): what you type goes to Claude as it is, read
 * after its current step while it works, or carrying its session on once it has finished or stopped. In its
 * place, one line when there's nothing to carry on (AC-14).
 */
export function FollowUpBox({ session }: { session: Session }) {
  const keyName = sourceLabel(session.source) ?? session.title;
  if (session.followUp.kind === 'open') return <FollowUpForm session={session} keyName={keyName} />;
  const off = followUpOffLine(session.followUp, keyName);
  return (
    <p className="m-0 text-small text-muted-foreground">
      {off.line}
      {off.link === null ? null : (
        <>
          {' '}
          {/* A link in a sentence, drawn as Tickets draws one: told apart by more than its colour. */}
          <Link to="/sessions/$sessionId" params={{ sessionId: off.link.sessionId }} className="text-info underline">
            {off.link.label}
          </Link>
        </>
      )}
    </p>
  );
}
