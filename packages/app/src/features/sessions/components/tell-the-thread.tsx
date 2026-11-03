import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { mostThreadReplyCharacters, type Session, type ThreadChip } from '@devhub/contracts';
import { Button, Callout, ExternalLink, Field, Textarea } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { useDismissThreadReply, usePostThreadReply } from '../queries.ts';

const ReplySchema = z.object({
  text: z.string().trim().min(1, 'Write the reply first.').max(mostThreadReplyCharacters),
});
type ReplyValues = z.infer<typeof ReplySchema>;

/** The session's first thread, the one its reply goes to (spec 016, E). */
function firstThread(session: Session): ThreadChip | null {
  for (const chip of session.context) {
    if (chip.kind === 'slack_thread' || chip.kind === 'discord_thread') return chip;
  }
  return null;
}

/** "#web-platform", or "the direct message". */
function placeOf(channel: string | null | undefined): string {
  return channel === null || channel === undefined ? 'the direct message' : `#${channel}`;
}

/**
 * "Tell the thread" (spec 016, E): once the session's pull request is open, and the session was sent a Slack or
 * Discord thread, a reply with the pull request's link to edit and post, only on Post reply (rule 11). Posted, it
 * says where, with Open thread; Not now puts it off for this session.
 */
export function TellTheThread({ session }: { session: Session }) {
  const thread = firstThread(session);
  const pull = session.pullRequest;
  const post = usePostThreadReply(session.id);
  const dismiss = useDismissThreadReply(session.id);
  const platform = usePlatform();
  const form = useForm<ReplyValues>({
    resolver: zodResolver(ReplySchema),
    defaultValues: { text: pull === null ? '' : `A fix is up for review: ${pull.title ?? session.title} ${pull.url}` },
  });
  if (thread === null || pull === null || session.threadReply?.state === 'dismissed') return null;
  const tool = thread.kind === 'slack_thread' ? 'Slack' : 'Discord';
  const reply = session.threadReply;

  if (reply?.state === 'posted') {
    return (
      <Callout tone="success" title={`Replied in ${placeOf(reply.channel)}.`}>
        <ExternalLink
          href={reply.url}
          className="self-start"
          onOpen={(href) => {
            platform.openExternal(href);
          }}
        >
          Open thread
        </ExternalLink>
      </Callout>
    );
  }

  const failed = post.data?.result === 'failed' ? post.data.reason : post.isError ? post.error.message : null;
  const { errors } = form.formState;
  return (
    <Callout tone="info" title="Tell the thread">
      <form
        aria-label="Tell the thread"
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          void form.handleSubmit(({ text }) => {
            post.mutate(text);
          })(event);
        }}
      >
        <Field label={`Reply in ${placeOf(thread.label?.channel)}`} error={errors.text?.message}>
          <Textarea rows={3} {...form.register('text')} />
        </Field>
        {failed === null ? null : (
          <p role="alert" className="m-0 text-small text-danger">
            {tool} didn&apos;t post it: {failed}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" size="sm" pending={post.isPending}>
            Post reply
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={post.isPending}
            pending={dismiss.isPending}
            onClick={() => {
              dismiss.mutate();
            }}
          >
            Not now
          </Button>
        </div>
      </form>
    </Callout>
  );
}
