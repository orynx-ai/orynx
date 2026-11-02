import { useId, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ClaudeIcon } from '@hugeicons/core-free-icons';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import type { ReviewComment } from '@devhub/contracts';
import { Button, CheckboxBox, DiffNote, Field, Icon, Markdown, Textarea } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { useChangeReviewComment } from '../queries.ts';
import { reviewWords } from '../review-words.ts';
import { reviewCommentFormSchema, type ReviewCommentFormValues } from '../schemas.ts';

/**
 * One of Claude's review comments under its line (spec 050, `session-review.html`'s reviewer's note): Keep and Edit
 * until it's posted, then Posted. Unticked, it stays here, fainter, and won't be posted.
 */
export function ReviewNote({ sessionId, comment }: { sessionId: string; comment: ReviewComment }) {
  const change = useChangeReviewComment(sessionId);
  const platform = usePlatform();
  const [editing, setEditing] = useState(false);
  // Back on Edit once the box has gone (AC-24): Edit takes focus as it comes back.
  const refocus = useRef(false);
  const keepId = useId();
  const posted = comment.postedAt !== null;
  const done = () => {
    refocus.current = true;
    setEditing(false);
  };

  const footer =
    posted || editing ? undefined : (
      <>
        <CheckboxBox
          id={keepId}
          checked={comment.keep}
          disabled={change.isPending}
          onCheckedChange={(checked) => {
            change.mutate({ commentId: comment.id, change: { keep: checked === true } });
          }}
        />
        <label htmlFor={keepId}>{reviewWords.keep}</label>
        <Button
          ref={(element) => {
            if (element === null || !refocus.current) return;
            refocus.current = false;
            element.focus();
          }}
          variant="ghost"
          size="sm"
          onClick={() => {
            setEditing(true);
          }}
        >
          {reviewWords.edit}
        </Button>
      </>
    );

  return (
    <DiffNote
      aria-label={reviewWords.note(comment.path, comment.line)}
      mark={<Icon icon={ClaudeIcon} />}
      author={reviewWords.author}
      {...(posted ? { meta: reviewWords.posted } : {})}
      muted={!posted && !comment.keep}
      {...(footer === undefined ? {} : { footer })}
    >
      {editing ? (
        <EditComment sessionId={sessionId} comment={comment} change={change} onDone={done} />
      ) : (
        <Markdown
          text={comment.text}
          onOpenLink={(url) => {
            platform.openExternal(url);
          }}
        />
      )}
    </DiffNote>
  );
}

function EditComment({
  comment,
  change,
  onDone,
}: {
  sessionId: string;
  comment: ReviewComment;
  change: ReturnType<typeof useChangeReviewComment>;
  onDone: () => void;
}) {
  const form = useForm<ReviewCommentFormValues, unknown, z.output<typeof reviewCommentFormSchema>>({
    resolver: zodResolver(reviewCommentFormSchema),
    defaultValues: { text: comment.text },
  });
  const { errors } = form.formState;
  const submit = form.handleSubmit(({ text }) =>
    change.mutateAsync({ commentId: comment.id, change: { text } }).then(
      onDone,
      // The line under the box says it failed; your words stay.
      () => undefined,
    ),
  );
  const { ref, ...field } = form.register('text');
  return (
    <form noValidate className="flex flex-col gap-2 py-1" onSubmit={(event) => void submit(event)}>
      <Field label={reviewWords.comment} error={errors.text?.message}>
        <Textarea
          rows={4}
          {...field}
          ref={(element) => {
            ref(element);
            element?.focus();
          }}
        />
      </Field>
      {change.isError ? (
        <p role="alert" className="m-0 text-danger">
          {reviewWords.unsaved}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" pending={change.isPending}>
          {reviewWords.save}
        </Button>
        <Button variant="ghost" size="sm" disabled={change.isPending} onClick={onDone}>
          {reviewWords.cancel}
        </Button>
      </div>
    </form>
  );
}
