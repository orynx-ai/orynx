import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
  type RefObject,
  type SubmitEvent,
} from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { DraftedPush, PushAnswer, Session } from '@devhub/contracts';
import { Button, Dialog, DialogContent, DialogTitle, DialogTrigger, Field, Input, Skeleton } from '@devhub/ui';
import { cannotPushWords, failureLine, pullRequestWords, pushHappensLine } from '../pull-request-words.ts';
import { useDraftPush, usePushChanges } from '../queries.ts';
import { pushFormSchema, type PushFormValues } from '../schemas.ts';

/** Claude's commit message, editable, and what pressing Push changes will do (Q7, Q10e). */
function PushForm({
  draft,
  repository,
  pushing,
  answer,
  failedToSend,
  onPush,
  onCancel,
}: {
  draft: DraftedPush;
  repository: string;
  pushing: boolean;
  answer: PushAnswer | undefined;
  failedToSend: boolean;
  onPush: (message: string) => void;
  onCancel: () => void;
}) {
  const form = useForm<PushFormValues, unknown, { message: string }>({
    resolver: zodResolver(pushFormSchema),
    defaultValues: { message: draft.message },
  });
  const failed = answer?.result === 'failed' ? answer.problem : null;

  useEffect(() => {
    form.setFocus('message');
  }, [form]);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.handleSubmit(({ message }) => {
      onPush(message);
    })(event);
  }

  return (
    <form noValidate aria-label={pullRequestWords.push} className="flex flex-col gap-4" onSubmit={submit}>
      <Field label={pullRequestWords.commitMessage} error={form.formState.errors.message?.message}>
        <Input
          readOnly={pushing}
          {...form.register('message')}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            // A push goes to your team, as a pull request does: it takes the button (Q10a).
            if (event.key === 'Enter') event.preventDefault();
          }}
        />
      </Field>
      <p className="m-0 text-small text-muted-foreground">{pushHappensLine(draft)}</p>
      {failed === null && !failedToSend ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {failed === null
            ? pullRequestWords.pushFailed
            : failureLine(failed, { repository, branch: draft.branch, base: '' })}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" disabled={pushing} onClick={onCancel}>
          {pullRequestWords.cancel}
        </Button>
        <Button type="submit" variant="primary" pending={pushing}>
          {pushing ? pullRequestWords.pushing : pullRequestWords.push}
        </Button>
      </div>
    </form>
  );
}

/** One line in place of the field: nothing new, or why Orynx can't push. */
function NoPush({ line, onCancel }: { line: string; onCancel: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-muted-foreground">{line}</p>
      <div className="flex justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {pullRequestWords.cancel}
        </Button>
      </div>
    </div>
  );
}

/**
 * Push changes (spec 014, Q7): once the pull request is open, commits what's new and pushes it to the same branch,
 * so the pull request updates, only on your press in its dialog. Opening it asks Claude for a commit message.
 */
export function PushChanges({
  session,
  repository,
  show,
  onPushed,
  menu,
  ref,
}: {
  session: Session;
  repository: string;
  /** Whether its button shows: once there's something to push. An open dialog stays until it closes. */
  show: boolean;
  /** Called once the dialog has closed after the push, as its button goes, so focus can move on. */
  onPushed: () => void;
  /** Opened from this menu's item rather than a button of its own (under 768 px); closing gives the menu focus. */
  menu?: RefObject<HTMLElement | null>;
  /** Opens the dialog, for the menu's item. */
  ref?: Ref<{ open: () => void }>;
}) {
  const [open, setOpen] = useState(false);
  const describedBy = useId();
  const drafting = useDraftPush(session.id);
  const push = usePushChanges(session.id);
  const pushed = useRef(false);

  function openChange(next: boolean) {
    if (!next && push.isPending) return;
    setOpen(next);
    if (next) {
      push.reset();
      drafting.mutate();
    }
  }
  const cancel = () => {
    openChange(false);
  };
  useImperativeHandle(ref, () => ({
    open: () => {
      openChange(true);
    },
  }));

  function pushNow(message: string) {
    push.mutate(message, {
      onSuccess: (answer) => {
        if (answer.result !== 'pushed') return;
        pushed.current = true;
        setOpen(false);
      },
    });
  }

  const answer = push.data;
  const drafted = drafting.data;
  let body;
  if (answer?.result === 'nothing_new' || drafted?.result === 'nothing_new') {
    body = <NoPush line={pullRequestWords.nothingNew} onCancel={cancel} />;
  } else if (answer?.result === 'cannot') {
    body = <NoPush line={cannotPushWords(answer.reason)} onCancel={cancel} />;
  } else if (drafted?.result === 'cannot') {
    body = <NoPush line={cannotPushWords(drafted.reason)} onCancel={cancel} />;
  } else if (drafted?.result === 'draft') {
    body = (
      <PushForm
        draft={drafted}
        repository={repository}
        pushing={push.isPending}
        answer={answer}
        failedToSend={push.isError}
        onPush={pushNow}
        onCancel={cancel}
      />
    );
  } else if (drafting.isError) {
    body = <NoPush line={pullRequestWords.draftFailed} onCancel={cancel} />;
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <p role="status" className="m-0 text-small text-muted-foreground">
          {pullRequestWords.draftingMessage}
        </p>
        <div aria-hidden className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-foreground">{pullRequestWords.commitMessage}</span>
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={cancel}>
            {pullRequestWords.cancel}
          </Button>
          <Button type="button" variant="primary" pending={false} disabled>
            {pullRequestWords.push}
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
            {pullRequestWords.push}
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent
        aria-describedby={describedBy}
        className="gap-4 p-6"
        onCloseAutoFocus={(event) => {
          if (pushed.current) {
            // Not back to Push changes, which goes once origin has everything.
            pushed.current = false;
            event.preventDefault();
            onPushed();
            return;
          }
          if (menu === undefined) return;
          event.preventDefault();
          menu.current?.focus();
        }}
      >
        <div className="flex flex-col gap-1">
          <DialogTitle>{pullRequestWords.push}</DialogTitle>
          <p id={describedBy} className="m-0 font-mono text-code text-muted-foreground">
            {repository}
          </p>
        </div>
        {body}
      </DialogContent>
    </Dialog>
  );
}
