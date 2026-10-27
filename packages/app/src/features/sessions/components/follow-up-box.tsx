import { useMemo, useRef, useState, type SubmitEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from '@tanstack/react-router';
import { useForm, useWatch } from 'react-hook-form';
import type { ComposerChip, Session } from '@devhub/contracts';
import { Composer, ComposerBar, ComposerSend, ComposerTextarea } from '@devhub/ui';
import { AddContext } from '../../home/components/add-context.tsx';
import { AgentPicker, useAgentChoice } from '../../home/components/agent-picker.tsx';
import { ContextStrip } from '../../home/components/context-strip.tsx';
import { ComposerChipsProvider, type ComposerChips } from '../../home/composer-chips.tsx';
import { chipFromPaste } from '../../home/composer-rules.ts';
import { contextFailedLine, refusedLine, type SettingsLink } from '../../home/composer-words.ts';
import { useComposerStore } from '../../home/store.ts';
import { cannotSendLine, followUpBox, followUpOffLine, sendFailedLine } from '../follow-up-words.ts';
import { useSendMessage } from '../queries.ts';
import { followUpFormSchema, type FollowUpFormValues } from '../schemas.ts';
import { useSessionDrafts } from '../store.ts';

const noChips: ComposerChip[] = [];

/**
 * The follow-up as Home's composer draws a task (the user's call, 19 Oct 2026): your words, the tickets, pull
 * requests and files added to it, + Add context without a folder (the session has one), the model and effort, and
 * Send. The chips are this session's own draft; the model and effort are the ones you last picked anywhere.
 */
function FollowUpForm({ session }: { session: Session }) {
  const draft = useSessionDrafts((state) => state.drafts[session.id] ?? '');
  const chips = useSessionDrafts((state) => state.chips[session.id] ?? noChips);
  const setDraft = useSessionDrafts((state) => state.setDraft);
  const clearDraft = useSessionDrafts((state) => state.clearDraft);
  const addChipTo = useSessionDrafts((state) => state.addChip);
  const removeChipFrom = useSessionDrafts((state) => state.removeChip);
  const dropChipFrom = useSessionDrafts((state) => state.dropChip);
  const model = useComposerStore((state) => state.model);
  const effort = useComposerStore((state) => state.effort);
  const setModel = useComposerStore((state) => state.setModel);
  const setEffort = useComposerStore((state) => state.setEffort);
  const choice = useAgentChoice(model, effort);
  const send = useSendMessage(session.id);
  // Why a chip wasn't added: a full kind, or a file that looks like a secret.
  const [refused, setRefused] = useState<string | null>(null);
  const form = useForm<FollowUpFormValues, unknown, { text: string }>({
    resolver: zodResolver(followUpFormSchema),
    defaultValues: { text: draft },
  });
  const box = useRef<HTMLTextAreaElement | null>(null);
  const field = form.register('text', {
    onChange: (event: { target: { value: string } }) => {
      setDraft(session.id, event.target.value);
      setRefused(null);
      // What was said about the last try no longer fits once you change the text.
      if (send.isError || send.data !== undefined) send.reset();
    },
  });
  const given = useMemo<ComposerChips>(
    () => ({
      chips,
      addChip: (chip) => addChipTo(session.id, chip),
      removeChip: (index) => {
        removeChipFrom(session.id, index);
      },
      dropChip: (chip) => {
        dropChipFrom(session.id, chip);
      },
    }),
    [chips, session.id, addChipTo, removeChipFrom, dropChipFrom],
  );
  const canSend = useWatch({ control: form.control, name: 'text' }).trim() !== '';
  const answer = send.data;
  const failed = answer?.result === 'context_failed' ? send.variables?.context?.[answer.chip] : undefined;
  const tooLong = form.formState.errors.text?.message;
  const said: { line: string; link: SettingsLink | null } | null =
    refused !== null
      ? { line: refused, link: null }
      : tooLong !== undefined
        ? { line: tooLong, link: null }
        : send.isError
          ? { line: sendFailedLine, link: null }
          : answer?.result === 'cannot_send'
            ? { line: cannotSendLine(answer.reason), link: null }
            : answer?.result === 'context_failed'
              ? failed === undefined
                ? { line: sendFailedLine, link: null }
                : contextFailedLine(failed, answer.problem)
              : null;

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.handleSubmit(({ text }) => {
      send.mutate(
        { text, context: [...chips], ...choice },
        {
          onSuccess: (sent) => {
            if (sent.result !== 'sent') return;
            form.reset({ text: '' });
            clearDraft(session.id);
            box.current?.focus();
          },
        },
      );
    })(event);
  }

  return (
    <ComposerChipsProvider value={given}>
      <div className="flex flex-col gap-2">
        <Composer canSend={canSend} pending={send.isPending} onSubmit={submit}>
          <ContextStrip box={() => box.current} />
          <ComposerTextarea
            label={followUpBox.label}
            placeholder={followUpBox.placeholder}
            {...field}
            onPaste={(event) => {
              // A paste that is exactly one key or pull request link becomes its chip, as on Home.
              const chip = chipFromPaste(event.clipboardData.getData('text/plain'));
              if (chip === null) return;
              event.preventDefault();
              const refusal = given.addChip(chip);
              setRefused(refusal === null ? null : refusedLine(refusal));
            }}
            ref={(element) => {
              field.ref(element);
              box.current = element;
            }}
          />
          <ComposerBar>
            <AddContext
              folders={false}
              onPicked={() => {
                box.current?.focus();
              }}
              onRefused={setRefused}
              box={() => box.current}
            />
            {/* The picker's own row under 640 px, as on Home, so the box never grows when it arrives. */}
            <div className="flex min-h-8 min-w-0 items-center gap-2 max-sm:order-last max-sm:basis-full">
              <AgentPicker model={model} effort={effort} onModelChange={setModel} onEffortChange={setEffort} />
            </div>
            <ComposerSend label={followUpBox.send} />
          </ComposerBar>
        </Composer>
        {said === null ? null : (
          <p role="alert" className="m-0 text-small text-danger">
            {said.line}
            {said.link === null ? null : (
              <>
                {' '}
                <Link to="/settings/$tab" params={{ tab: said.link.tab }} className="text-info underline">
                  {said.link.label}
                </Link>
              </>
            )}
          </p>
        )}
      </div>
    </ComposerChipsProvider>
  );
}

/**
 * The follow-up box at the end of Claude's progress (spec 013, Q1): what you type goes to Claude as it is, read
 * after its current step while it works, or carrying its session on once it has finished or stopped. In its
 * place, one line when there's nothing to carry on (AC-14).
 */
export function FollowUpBox({ session }: { session: Session }) {
  if (session.followUp.kind === 'open') return <FollowUpForm session={session} />;
  return <p className="m-0 text-small text-muted-foreground">{followUpOffLine(session.followUp)}</p>;
}
