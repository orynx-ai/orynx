import { useEffect, useId, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { PostReviewRequestSchema, type Session, type SessionReview } from '@devhub/contracts';
import {
  Button,
  Callout,
  ChoiceCard,
  ChoiceGroup,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  Field,
  Textarea,
} from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { usePostReview, useReviewStatus } from '../queries.ts';
import { reviewProblemLine, reviewWords } from '../review-words.ts';

type ReviewFormValues = z.input<typeof PostReviewRequestSchema>;

/**
 * The next move for a review (spec 050, AC-11, AC-13, AC-21, AC-22): once Claude isn't working, how many comments it
 * left with Post review; once everything kept went, Review posted with Open on GitHub, which then takes focus.
 */
export function ReviewMove({ session, review }: { session: Session; review: SessionReview }) {
  const platform = usePlatform();
  const openOnGitHub = useRef<HTMLButtonElement>(null);
  const postedCount = useRef(review.posted.length);
  useEffect(() => {
    if (review.posted.length > postedCount.current) openOnGitHub.current?.focus();
    postedCount.current = review.posted.length;
  }, [review.posted.length]);

  if (session.state === 'working' || session.state === 'needs_you') return null;
  const waiting = review.comments.filter((comment) => comment.postedAt === null);
  const last = review.posted.at(-1);
  // Posted, with nothing you kept still to go: a comment you dropped stays here, unposted.
  const done = last !== undefined && !waiting.some((comment) => comment.keep);
  const title = done
    ? reviewWords.postedTitle
    : waiting.length === 0
      ? reviewWords.nothing
      : reviewWords.left(waiting.length);
  return (
    <Callout
      role="status"
      aria-label={title}
      tone={done ? 'success' : 'warning'}
      title={title}
      actionsAt="end"
      actions={
        done ? (
          <Button
            ref={openOnGitHub}
            variant="secondary"
            size="sm"
            onClick={() => {
              platform.openExternal(last.url);
            }}
          >
            {reviewWords.openOnGitHub}
          </Button>
        ) : (
          <PostReview session={session} review={review} />
        )
      }
    />
  );
}

/** Post review's button and dialog (spec 050): the only thing in a review that writes to GitHub (rule 11). */
function PostReview({ session, review }: { session: Session; review: SessionReview }) {
  const [open, setOpen] = useState(false);
  const describedBy = useId();
  const posting = usePostReview(session.id);
  const status = useReviewStatus(session.id, open);

  function openChange(next: boolean) {
    // Nothing closes the dialog while GitHub takes the review.
    if (!next && posting.isPending) return;
    setOpen(next);
    if (next) posting.reset();
  }

  const waiting = review.comments.filter((comment) => comment.postedAt === null);
  const kept = waiting.filter((comment) => comment.keep).length;
  const pushed = status.data?.result === 'ready' ? status.data.pushed : 0;
  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm">
          {reviewWords.button}
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={describedBy} className="gap-4 p-6">
        <DialogTitle>{reviewWords.title(review.number)}</DialogTitle>
        <p id={describedBy} className="m-0 text-small text-muted-foreground">
          {reviewWords.going(kept, waiting.length)}
        </p>
        {pushed > 0 ? <Callout tone="info" title={reviewWords.pushed(pushed)} /> : null}
        <ReviewForm
          review={review}
          posting={posting}
          onPosted={() => {
            setOpen(false);
          }}
          onCancel={() => {
            openChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ReviewForm({
  review,
  posting,
  onPosted,
  onCancel,
}: {
  review: SessionReview;
  posting: ReturnType<typeof usePostReview>;
  onPosted: () => void;
  onCancel: () => void;
}) {
  const form = useForm<ReviewFormValues, unknown, z.output<typeof PostReviewRequestSchema>>({
    resolver: zodResolver(PostReviewRequestSchema),
    // Always Comment: Approve and Request changes are yours to pick (Q3).
    defaultValues: { summary: review.summary ?? '', verdict: 'comment' },
  });
  const { errors } = form.formState;
  const submit = form.handleSubmit((request) =>
    posting.mutateAsync(request).then(
      (answer) => {
        if (answer.result === 'posted') onPosted();
      },
      // The dialog says it couldn't send; your words stay.
      () => undefined,
    ),
  );
  const answer = posting.data;
  const line =
    answer?.result === 'failed'
      ? reviewProblemLine(answer.problem, review.repository)
      : answer?.result === 'cannot'
        ? reviewWords.notConnected
        : posting.isError
          ? reviewWords.notSent
          : null;
  const verdictField = form.register('verdict');
  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <Field label={reviewWords.summary} error={errors.summary?.message}>
        <Textarea rows={6} {...form.register('summary')} />
      </Field>
      <div className="flex flex-col gap-2">
        <ChoiceGroup legend={reviewWords.verdict}>
          {(['comment', 'approve', 'request_changes'] as const).map((verdict) => (
            <ChoiceCard key={verdict} value={verdict} title={reviewWords.verdicts[verdict]} {...verdictField} />
          ))}
        </ChoiceGroup>
        {review.verdict === null ? null : (
          <p className="m-0 text-small text-muted-foreground">{reviewWords.claudeWould[review.verdict]}</p>
        )}
      </div>
      {line === null ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {line}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" disabled={posting.isPending} onClick={onCancel}>
          {reviewWords.cancel}
        </Button>
        <Button type="submit" variant="primary" pending={posting.isPending}>
          {posting.isPending ? reviewWords.posting : reviewWords.button}
        </Button>
      </div>
    </form>
  );
}
