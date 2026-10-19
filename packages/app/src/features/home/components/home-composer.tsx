import { useRef, useState, type SubmitEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { File01Icon } from '@hugeicons/core-free-icons';
import { Link, useNavigate } from '@tanstack/react-router';
import { useForm, useWatch } from 'react-hook-form';
import type { ComposerChip, StartSessionAnswer } from '@devhub/contracts';
import {
  Composer,
  ComposerBar,
  ComposerSend,
  ComposerTextarea,
  ContextChip,
  ContextList,
  Icon,
  SourceMark,
} from '@devhub/ui';
import { newTaskTargetId } from '../../../shell/main-content.ts';
import { useRepositories, useStatus } from '../../settings/queries.ts';
import { chipFromPaste, firstTicket, folderFor } from '../composer-rules.ts';
import {
  cannotStartLine,
  chipLabel,
  composerWords,
  contextFailedLine,
  placeholderFor,
  refusedLine,
  removedLine,
  type SettingsLink,
} from '../composer-words.ts';
import { useStartFromComposer } from '../queries.ts';
import { AddContext } from './add-context.tsx';
import { AgentPicker } from './agent-picker.tsx';
import { FolderPicker } from './folder-picker.tsx';
import { composerFormSchema, type ComposerFormValues } from '../schemas.ts';
import { useComposerStore } from '../store.ts';

/** The chip's mark: the tool's own for a ticket or a pull request, a file icon for a file. */
function chipIcon(chip: ComposerChip) {
  if (chip.kind === 'jira') return <SourceMark source="jira" label="none" />;
  if (chip.kind === 'pull_request') return <SourceMark source="github" label="none" />;
  return <Icon icon={File01Icon} aria-hidden />;
}

interface Said {
  line: string;
  link: SettingsLink | null;
  session: string | null;
}

/** What Send's answer says under the box, when it started nothing (AC-21 to AC-23). */
function saidFor(answer: StartSessionAnswer, chips: readonly ComposerChip[]): Said | null {
  switch (answer.result) {
    case 'started':
      return null;
    case 'existing':
      // Only the first ticket's session stops a start (spec 022, Q2).
      return { line: composerWords.existing(firstTicket(chips) ?? ''), link: null, session: answer.sessionId };
    case 'cannot_start':
      return { ...cannotStartLine(answer.reason), session: null };
    case 'context_failed': {
      const chip = chips[answer.chip];
      return chip === undefined
        ? { line: composerWords.failed, link: null, session: null }
        : { ...contextFailedLine(chip, answer.problem), session: null };
    }
  }
}

/**
 * Home's composer (spec 015): your words, the chips Claude will read, and Send. Send starts a session and opens
 * it; anything that stops it shows one line under the box, and the draft stays (AC-21 to AC-23). The draft lives
 * in the composer's store, so leaving Home keeps it (Q14).
 */
export function HomeComposer() {
  const navigate = useNavigate();
  const text = useComposerStore((state) => state.text);
  const chips = useComposerStore((state) => state.chips);
  const picked = useComposerStore((state) => state.picked);
  const lastUsed = useComposerStore((state) => state.lastUsed);
  const setText = useComposerStore((state) => state.setText);
  const removeChip = useComposerStore((state) => state.removeChip);
  const addChip = useComposerStore((state) => state.addChip);
  const sent = useComposerStore((state) => state.sent);
  const repositories = useRepositories();
  const status = useStatus();
  const start = useStartFromComposer();
  // Both pickers come at once, when both have what they need: one arriving first would move the other (AC-1).
  const pickers = repositories.data !== undefined && status.data !== undefined;
  const [removed, setRemoved] = useState('');
  // Why a file wasn't added (AC-12); it goes when the draft changes or another file is added.
  const [refused, setRefused] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);

  const form = useForm<ComposerFormValues, unknown, { message: string }>({
    resolver: zodResolver(composerFormSchema),
    defaultValues: { message: text },
  });
  const field = form.register('message', {
    onChange: (event: { target: { value: string } }) => {
      setText(event.target.value);
      setRefused(null);
      // What was said about the last try no longer fits once the draft changes.
      if (start.isError || start.data !== undefined) start.reset();
    },
  });
  const message = useWatch({ control: form.control, name: 'message' });
  const ticketKeys = chips.flatMap((chip) => (chip.kind === 'jira' ? [chip.key] : []));
  const ticketKey = firstTicket(chips);
  const shown = folderFor({ folders: repositories.data?.repositories ?? [], picked, ticketKey, lastUsed });
  const canSend = message.trim() !== '' || ticketKey !== null;

  const answered = start.data === undefined ? null : saidFor(start.data, start.variables.context);
  const tooLong = form.formState.errors.message?.message;
  const said: Said | null =
    refused !== null
      ? { line: refused, link: null, session: null }
      : tooLong === undefined
        ? start.isError
          ? { line: composerWords.failed, link: null, session: null }
          : answered
        : { line: tooLong, link: null, session: null };

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.handleSubmit(({ message: words }) => {
      const repositoryId = shown.kind === 'folder' ? shown.folder.id : undefined;
      start.mutate(
        { message: words, context: chips, ...(repositoryId === undefined ? {} : { repositoryId }) },
        {
          onSuccess: (answer) => {
            if (answer.result !== 'started') return;
            form.reset({ message: '' });
            sent(repositoryId ?? null);
            void navigate({ to: '/sessions/$sessionId', params: { sessionId: answer.sessionId } });
          },
        },
      );
    })(event);
  }

  return (
    <div className="flex flex-col gap-2">
      <Composer canSend={canSend} pending={start.isPending} onSubmit={submit}>
        {chips.length === 0 ? null : (
          <ContextList aria-label={composerWords.contextList}>
            {chips.map((chip, index) => {
              const label = chipLabel(chip);
              return (
                <ContextChip
                  key={`${chip.kind}:${label}`}
                  label={label}
                  icon={chipIcon(chip)}
                  onRemove={() => {
                    removeChip(index);
                    setRemoved(removedLine(label));
                  }}
                />
              );
            })}
          </ContextList>
        )}
        <ComposerTextarea
          id={newTaskTargetId}
          label={composerWords.label}
          placeholder={placeholderFor(ticketKeys)}
          readOnly={start.isPending}
          {...field}
          onPaste={(event) => {
            // A paste that is exactly one key or pull request link becomes its chip (AC-14, Q6).
            const chip = chipFromPaste(event.clipboardData.getData('text/plain'));
            if (chip === null) return;
            event.preventDefault();
            const refusal = addChip(chip);
            setRefused(refusal === null ? null : refusedLine(refusal));
          }}
          ref={(element) => {
            field.ref(element);
            box.current = element;
          }}
        />
        <ComposerBar>
          <AddContext
            onPicked={() => {
              box.current?.focus();
            }}
            onRefused={setRefused}
          />
          {/* The pickers' own row under 640 px, there from the first paint, so the box never grows when they
              arrive (AC-1, AC-30); in a wider window they sit between + and Send. */}
          <div className="flex min-h-8 min-w-0 items-center gap-2 max-sm:order-last max-sm:basis-full">
            {pickers ? (
              <>
                <FolderPicker />
                <AgentPicker />
              </>
            ) : null}
          </div>
          <ComposerSend label={start.isPending ? composerWords.sending : composerWords.send} />
        </ComposerBar>
      </Composer>
      <p role="status" className="sr-only">
        {removed}
      </p>
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
          {said.session === null ? null : (
            <>
              {' '}
              <Link to="/sessions/$sessionId" params={{ sessionId: said.session }} className="text-info underline">
                {composerWords.openSession}
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
