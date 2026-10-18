import { useEffect, useId, useRef, useState, type KeyboardEvent, type SubmitEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { GitPullRequestIcon } from '@hugeicons/core-free-icons';
import { Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import type { CreatePullRequestAnswer, Session } from '@devhub/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  Field,
  Icon,
  Input,
  Skeleton,
  Textarea,
} from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { cannotOpenWords, failureLine, pullRequestWords, whatHappensLine, whereLine } from '../pull-request-words.ts';
import { useCreatePullRequest, useDraftPullRequest } from '../queries.ts';
import { pullRequestFormSchema, type PullRequestFormValues } from '../schemas.ts';
import { usePullRequestDrafts, type KeptPullRequestDraft } from '../store.ts';

/** Which of Claude's runs a draft follows: a new run ends at another time, so the next opening drafts afresh. */
function runOf(session: Session): string {
  return `${session.endedAt ?? ''}:${String(session.activities.length)}`;
}

/** Claude's draft, editable, and what pressing Create will do (Q3, Q10a); Create itself sends it. */
function PullRequestForm({
  session,
  kept,
  creating,
  answer,
  failedToSend,
  onCreate,
  onCancel,
}: {
  session: Session;
  kept: KeptPullRequestDraft;
  creating: boolean;
  answer: CreatePullRequestAnswer | undefined;
  failedToSend: boolean;
  onCreate: (values: { title: string; body: string }) => void;
  onCancel: () => void;
}) {
  const platform = usePlatform();
  const edit = usePullRequestDrafts((state) => state.edit);
  const form = useForm<PullRequestFormValues, unknown, { title: string; body: string }>({
    resolver: zodResolver(pullRequestFormSchema),
    defaultValues: { title: kept.title, body: kept.body },
  });
  const { errors } = form.formState;
  const { draft } = kept;
  const failed = answer?.result === 'failed' ? answer.problem : null;

  useEffect(() => {
    // Claude's draft is in: you start on its title (Q10a).
    form.setFocus('title');
  }, [form]);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.handleSubmit(onCreate)(event);
  }

  return (
    <form noValidate aria-label={pullRequestWords.create} className="flex min-h-0 flex-col gap-4" onSubmit={submit}>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
        {draft.byClaude ? null : <p className="m-0 text-small text-muted-foreground">{pullRequestWords.notDrafted}</p>}
        <Field label={pullRequestWords.title} error={errors.title?.message}>
          <Input
            readOnly={creating}
            {...form.register('title', {
              onChange: (event: { target: { value: string } }) => {
                edit(session.id, { title: event.target.value });
              },
            })}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              // A pull request goes to your team, so it takes the button, never Enter in the title (Q10a).
              if (event.key === 'Enter') event.preventDefault();
            }}
          />
        </Field>
        <Field
          label={pullRequestWords.description}
          help={pullRequestWords.descriptionHelp}
          error={errors.body?.message}
        >
          <Textarea
            readOnly={creating}
            {...form.register('body', {
              onChange: (event: { target: { value: string } }) => {
                edit(session.id, { body: event.target.value });
              },
            })}
          />
        </Field>
        <p className="m-0 text-small text-muted-foreground">{whatHappensLine(draft)}</p>
      </div>
      {failed === null && !failedToSend ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {failed === null ? pullRequestWords.createFailed : failureLine(failed, draft)}
          {failed?.kind === 'github_sso' ? (
            <>
              {' '}
              <a
                href={failed.url}
                rel="noreferrer"
                className="text-info underline"
                onClick={(event) => {
                  event.preventDefault();
                  platform.openExternal(failed.url);
                }}
              >
                {pullRequestWords.authorize}
              </a>
            </>
          ) : null}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" disabled={creating} onClick={onCancel}>
          {pullRequestWords.cancel}
        </Button>
        <Button type="submit" variant="primary" pending={creating}>
          {creating ? pullRequestWords.creating : pullRequestWords.create}
        </Button>
      </div>
    </form>
  );
}

/** While Claude drafts: the fields as skeletons in their final sizes, so nothing moves when the draft comes (AC-23). */
function Drafting({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="m-0 text-small text-muted-foreground">
        {pullRequestWords.drafting}
      </p>
      <div aria-hidden className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-foreground">{pullRequestWords.title}</span>
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-foreground">{pullRequestWords.description}</span>
          {/* Textarea's 10 lines of 24 px, its padding and its border. */}
          <Skeleton className="h-64.5 w-full" />
          <span className="text-small text-muted-foreground">{pullRequestWords.descriptionHelp}</span>
        </div>
        <span className="flex h-5 items-center">
          <Skeleton className="h-4 w-3/4" />
        </span>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {pullRequestWords.cancel}
        </Button>
        <Button type="button" variant="primary" disabled>
          {pullRequestWords.create}
        </Button>
      </div>
    </div>
  );
}

/** One line in place of the fields, when there can't be a pull request or the draft couldn't be had (Q10d). */
function NoPullRequest({
  line,
  settings,
  retry,
  onCancel,
}: {
  line: string;
  settings: boolean;
  retry: (() => void) | null;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-muted-foreground">
        {line}
        {settings ? (
          <>
            {' '}
            <Link to="/settings/$tab" params={{ tab: 'connections' }} className="text-info underline">
              {pullRequestWords.openSettings}
            </Link>
          </>
        ) : null}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {pullRequestWords.cancel}
        </Button>
        {retry === null ? null : (
          <Button type="button" variant="primary" onClick={retry}>
            {pullRequestWords.tryAgain}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Create pull request (spec 014): the title row's primary button, as `session.html` draws it, and its dialog.
 * Opening it asks Claude for a draft, which changes nothing (AC-14); Create in the dialog commits, pushes and
 * opens the pull request, and only that press does (AC-4). Closing keeps your edits while the page is open (Q10h).
 */
export function CreatePullRequest({
  session,
  show,
  onOpened,
}: {
  session: Session;
  /** Whether the title row offers it (Q2). An open dialog stays until it closes itself, even once the PR shows. */
  show: boolean;
  /** Called once the dialog has closed after the pull request opened, so focus can move on (AC-4). */
  onOpened: () => void;
}) {
  const [open, setOpen] = useState(false);
  /** The dialog is closing because the pull request opened. */
  const created = useRef(false);
  const describedBy = useId();
  const run = runOf(session);
  const kept = usePullRequestDrafts((state) => state.drafts[session.id]);
  const keep = usePullRequestDrafts((state) => state.keep);
  const forget = usePullRequestDrafts((state) => state.forget);
  const drafting = useDraftPullRequest(session.id);
  const create = useCreatePullRequest(session.id);
  // While the dialog is open it keeps the draft it opened with, even as the session moves on underneath.
  const current = kept !== undefined && (kept.run === run || open) ? kept : undefined;

  function askForDraft() {
    drafting.mutate(undefined, {
      onSuccess: (answer) => {
        if (answer.result === 'draft') keep(session.id, { run, draft: answer, title: answer.title, body: answer.body });
      },
    });
  }

  function openChange(next: boolean) {
    // Nothing closes the dialog while Orynx pushes and GitHub opens the pull request.
    if (!next && create.isPending) return;
    setOpen(next);
    if (!next) {
      create.reset();
      return;
    }
    if (current === undefined) askForDraft();
  }

  function createNow(values: { title: string; body: string }) {
    create.mutate(values, {
      onSuccess: (answer) => {
        if (answer.result !== 'opened') return;
        forget(session.id);
        created.current = true;
        setOpen(false);
      },
    });
  }

  const cancel = () => {
    openChange(false);
  };
  const cannot =
    create.data?.result === 'cannot'
      ? create.data.reason
      : drafting.data?.result === 'cannot' && current === undefined
        ? drafting.data.reason
        : null;

  let body;
  if (cannot !== null) {
    const words = cannotOpenWords(cannot);
    body = <NoPullRequest line={words.line} settings={words.settings} retry={null} onCancel={cancel} />;
  } else if (current !== undefined) {
    body = (
      <PullRequestForm
        session={session}
        kept={current}
        creating={create.isPending}
        answer={create.data}
        failedToSend={create.isError}
        onCreate={createNow}
        onCancel={cancel}
      />
    );
  } else if (drafting.isError) {
    body = <NoPullRequest line={pullRequestWords.draftFailed} settings={false} retry={askForDraft} onCancel={cancel} />;
  } else {
    body = <Drafting onCancel={cancel} />;
  }

  if (!show && !open) return null;
  return (
    <Dialog open={open} onOpenChange={openChange}>
      {show ? (
        <DialogTrigger asChild>
          <Button variant="primary">
            <Icon icon={GitPullRequestIcon} aria-hidden />
            {pullRequestWords.create}
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent
        aria-describedby={describedBy}
        className="gap-4 p-6"
        onCloseAutoFocus={(event) => {
          if (!created.current) return;
          // Not back to Create pull request, which goes: on to Open PR, once the dialog has let focus go.
          created.current = false;
          event.preventDefault();
          onOpened();
        }}
      >
        <div className="flex flex-col gap-1">
          <DialogTitle>{pullRequestWords.create}</DialogTitle>
          <p id={describedBy} className="m-0 font-mono text-code text-muted-foreground">
            {current === undefined ? <Skeleton className="h-5 w-64 max-w-full" /> : whereLine(current.draft)}
          </p>
        </div>
        {body}
      </DialogContent>
    </Dialog>
  );
}
