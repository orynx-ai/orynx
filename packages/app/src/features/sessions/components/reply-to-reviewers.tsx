import {
  useId,
  useImperativeHandle,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
  type SubmitEvent,
} from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import type { ReplyAnswer, ReplyDraft, ReplyRequest, Session } from '@devhub/contracts';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  Field,
  Skeleton,
  Textarea,
} from '@devhub/ui';
import {
  cannotReplyLine,
  noThreadsLine,
  pullRequestWords,
  replyProblemLine,
  replyWhereLine,
  replyWords,
  threadPlace,
} from '../pull-request-words.ts';
import { useDraftReplies, usePostReplies } from '../queries.ts';
import { repliesFormSchema, type RepliesFormValues } from '../schemas.ts';

type Failure = Extract<ReplyAnswer, { result: 'posted' }>['failed'][number];

/**
 * Each unresolved thread with Claude's reply and Resolve, as you leave them (spec 048). Post replies sends only the
 * threads with a reply or a tick. The threads that posted leave the list; a refused one stays with GitHub's words,
 * its box emptied when its reply went out, so a second press never posts it twice.
 */
function RepliesForm({
  draft,
  repository,
  onPost,
  onPosted,
  onCancel,
}: {
  draft: ReplyDraft;
  repository: string;
  onPost: (request: ReplyRequest) => Promise<ReplyAnswer>;
  onPosted: () => void;
  onCancel: () => void;
}) {
  const form = useForm<RepliesFormValues>({
    resolver: zodResolver(repliesFormSchema),
    defaultValues: {
      threads: draft.threads.map(({ id, reply, resolve }) => ({ threadId: id, reply, resolve })),
    },
  });
  const { fields } = useFieldArray({ control: form.control, name: 'threads' });
  const values = useWatch({ control: form.control, name: 'threads' });
  const [failures, setFailures] = useState<ReadonlyMap<string, Failure>>(new Map());
  const [line, setLine] = useState<string | null>(null);
  const shown = new Map(draft.threads.map((thread) => [thread.id, thread]));
  const posting = form.formState.isSubmitting;
  const anything = values.some((thread) => thread.reply.trim() !== '' || thread.resolve);

  async function post({ threads }: RepliesFormValues) {
    const sending = threads.filter((thread) => thread.reply.trim() !== '' || thread.resolve);
    setLine(null);
    let answer: ReplyAnswer;
    try {
      answer = await onPost({
        threads: sending.map(({ threadId, reply, resolve }) => ({ id: threadId, reply, resolve })),
      });
    } catch {
      setLine(replyWords.postFailed);
      return;
    }
    if (answer.result === 'cannot') {
      setLine(cannotReplyLine(answer.reason));
      return;
    }
    if (answer.failed.length === 0) {
      onPosted();
      return;
    }
    const failed = new Map(answer.failed.map((failure) => [failure.id, failure]));
    const sent = new Set(sending.map((thread) => thread.threadId));
    setFailures(failed);
    form.reset({
      threads: threads
        .filter((thread) => !sent.has(thread.threadId) || failed.has(thread.threadId))
        .map((thread) => (failed.get(thread.threadId)?.replied === true ? { ...thread, reply: '' } : thread)),
    });
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.handleSubmit(post)(event);
  }

  return (
    <form noValidate aria-label={replyWords.button} className="flex min-h-0 flex-col gap-4" onSubmit={submit}>
      {draft.byClaude ? null : <p className="m-0 text-small text-muted-foreground">{replyWords.notDrafted}</p>}
      <div className="-mx-6 flex min-h-0 flex-col gap-4 overflow-y-auto px-6">
        {fields.map((field, index) => {
          const thread = shown.get(field.threadId);
          const failure = failures.get(field.threadId);
          if (thread === undefined) return null;
          return (
            <fieldset key={field.id} className="flex flex-col gap-2 border-b border-border pb-4 last:border-b-0">
              <legend className="mb-1 font-mono text-code wrap-anywhere text-foreground">{threadPlace(thread)}</legend>
              <p className="m-0 line-clamp-4 text-small wrap-anywhere whitespace-pre-wrap text-muted-foreground">
                <span className="font-medium text-foreground">{thread.author}</span> <span>{thread.body}</span>
              </p>
              <Field label={replyWords.reply} error={form.formState.errors.threads?.[index]?.reply?.message}>
                <Textarea rows={3} readOnly={posting} {...form.register(`threads.${index}.reply`)} />
              </Field>
              <Controller
                control={form.control}
                name={`threads.${index}.resolve`}
                render={({ field: resolve }) => (
                  <Checkbox
                    label={replyWords.resolve}
                    checked={resolve.value}
                    disabled={posting}
                    onCheckedChange={(checked) => {
                      resolve.onChange(checked === true);
                    }}
                  />
                )}
              />
              {failure === undefined ? null : (
                <p role="alert" className="m-0 text-small text-danger">
                  {replyProblemLine(failure.problem, repository)}
                </p>
              )}
            </fieldset>
          );
        })}
      </div>
      {line === null ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {line}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" disabled={posting} onClick={onCancel}>
          {pullRequestWords.cancel}
        </Button>
        <Button type="submit" variant="primary" pending={posting} disabled={!anything}>
          {posting ? replyWords.posting : replyWords.post}
        </Button>
      </div>
    </form>
  );
}

/** One line in place of the threads, and the buttons it needs. */
function Note({ line, children }: { line: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-muted-foreground">{line}</p>
      <div className="flex flex-wrap justify-end gap-2">{children}</div>
    </div>
  );
}

/**
 * Reply to reviewers (spec 048): once the pull request is open, Claude's reply to each review thread its changes
 * address, to edit, and Post replies, the only thing here that writes to GitHub (rule 11). Opening it asks GitHub for
 * the threads and Claude for the replies.
 */
export function ReplyToReviewers({
  session,
  repository,
  number,
  show,
  menu,
  ref,
}: {
  session: Session;
  repository: string;
  number: number;
  /** Whether its button shows: while the pull request is open. An open dialog stays until it closes. */
  show: boolean;
  /** Opened from this menu's item rather than a button of its own (under 768 px); closing gives the menu focus. */
  menu?: RefObject<HTMLElement | null>;
  /** Opens the dialog, for the menu's item. */
  ref?: Ref<{ open: () => void }>;
}) {
  const [open, setOpen] = useState(false);
  const describedBy = useId();
  const drafting = useDraftReplies(session.id);
  const posting = usePostReplies(session.id);

  function openChange(next: boolean) {
    if (!next && posting.isPending) return;
    setOpen(next);
    if (next) {
      posting.reset();
      drafting.mutate();
    }
  }
  const close = () => {
    openChange(false);
  };
  useImperativeHandle(ref, () => ({
    open: () => {
      openChange(true);
    },
  }));

  const drafted = drafting.data;
  let body;
  if (drafted?.result === 'cannot') {
    body = (
      <Note line={cannotReplyLine(drafted.reason)}>
        <Button type="button" variant="secondary" onClick={close}>
          {replyWords.close}
        </Button>
      </Note>
    );
  } else if (drafted?.result === 'failed' || drafting.isError) {
    const why = drafted?.result === 'failed' ? ` ${replyProblemLine(drafted.problem, repository)}` : '';
    body = (
      <Note line={`${replyWords.notRead}${why}`}>
        <Button type="button" variant="secondary" onClick={close}>
          {pullRequestWords.cancel}
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            drafting.mutate();
          }}
        >
          {pullRequestWords.tryAgain}
        </Button>
      </Note>
    );
  } else if (drafted?.result === 'draft' && drafted.threads.length === 0) {
    body = (
      <Note line={noThreadsLine(drafted.number)}>
        <Button type="button" variant="secondary" onClick={close}>
          {replyWords.close}
        </Button>
      </Note>
    );
  } else if (drafted?.result === 'draft') {
    body = (
      <RepliesForm
        draft={drafted}
        repository={repository}
        onPost={(request) => posting.mutateAsync(request)}
        onPosted={() => {
          setOpen(false);
        }}
        onCancel={close}
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <p role="status" className="m-0 text-small text-muted-foreground">
          {replyWords.drafting}
        </p>
        {[0, 1].map((row) => (
          <div key={row} aria-hidden className="flex flex-col gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close}>
            {pullRequestWords.cancel}
          </Button>
          <Button type="button" variant="primary" pending={false} disabled>
            {replyWords.post}
          </Button>
        </div>
      </div>
    );
  }

  if (!show && !open) return null;
  return (
    <Dialog open={open} onOpenChange={openChange}>
      {show && menu === undefined ? (
        <DialogTrigger asChild>
          <Button variant="secondary" size="sm">
            {replyWords.button}
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent
        aria-describedby={describedBy}
        className="gap-4 p-6"
        onCloseAutoFocus={(event) => {
          if (menu === undefined) return;
          event.preventDefault();
          menu.current?.focus();
        }}
      >
        <div className="flex flex-col gap-1">
          <DialogTitle>{replyWords.button}</DialogTitle>
          <p id={describedBy} className="m-0 font-mono text-code text-muted-foreground">
            {replyWhereLine(repository, number)}
          </p>
        </div>
        {body}
      </DialogContent>
    </Dialog>
  );
}
