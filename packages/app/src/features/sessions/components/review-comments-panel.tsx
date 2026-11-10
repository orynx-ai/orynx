import type { PullThread, Session } from '@devhub/contracts';
import { Avatar, Button, DiffNote, EmptyState, ExternalLink, Markdown, Pill, Skeleton } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { agoText } from '../../../words/ago.ts';
import { useNow } from '../../../words/use-now.ts';
import { useReviewThreads, useSessionChanges } from '../queries.ts';
import { reviewCommentsWords as words } from '../review-words.ts';

/** Whether a session has the Review comments tab: its own pull request is open, so reviewers' threads reach it. */
export function hasReviewComments(session: Session): boolean {
  return session.pullRequest !== null && session.review === null;
}

/**
 * The Review comments tab (spec 057, B; `session-review.html`'s tab, its inside built from parts that exist, Q8):
 * reviewers' open threads on the session's own pull request, by file, with every comment. A thread the diff can't
 * show says why.
 */
export function ReviewCommentsPanel({ session }: { session: Session }) {
  const threads = useReviewThreads(session.id, hasReviewComments(session));
  const changes = useSessionChanges(session.id);

  if (threads.isPending) return <ReviewCommentsSkeleton />;
  if (threads.isError || threads.data.result !== 'threads') {
    return (
      <EmptyState
        title={words.failed}
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void threads.refetch();
            }}
          >
            {words.tryAgain}
          </Button>
        }
      />
    );
  }
  if (threads.data.threads.length === 0) return <EmptyState title={words.empty} />;

  const changed = new Set(changes.data?.state === 'ready' ? changes.data.files.map((file) => file.path) : []);
  const byFile = new Map<string, PullThread[]>();
  for (const thread of threads.data.threads) byFile.set(thread.path, [...(byFile.get(thread.path) ?? []), thread]);
  return (
    <div className="flex flex-col gap-4">
      {[...byFile].map(([path, list]) => (
        <section key={path} aria-label={path} className="flex flex-col gap-2">
          <h3 className="m-0 font-mono text-code break-all">{path}</h3>
          {list.map((thread) => (
            <ThreadNote key={thread.id} thread={thread} inDiff={thread.placeable && changed.has(thread.path)} />
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * One reviewer's thread as a note (`DiffNote`), in the tab and under its line in the diff: who started it, when and
 * where, its words, the replies after it, and its link to GitHub. `inDiff` false says why the diff doesn't show it.
 */
export function ThreadNote({ thread, inDiff = true }: { thread: PullThread; inDiff?: boolean }) {
  const platform = usePlatform();
  const now = useNow();
  const [first, ...replies] = thread.comments;
  if (first === undefined) return null;
  const ago = (at: string) => agoText(now.getTime() - Date.parse(at));
  const openLink = (url: string) => {
    platform.openExternal(url);
  };
  return (
    <DiffNote
      aria-label={words.note(first.author, thread.line)}
      mark={<Avatar initials={first.author.slice(0, 1).toUpperCase()} />}
      author={first.author}
      meta={`${words.where(thread.line)} · ${ago(first.at)}`}
      footer={
        <>
          {thread.outdated ? <Pill>{words.outdated}</Pill> : inDiff ? null : <Pill>{words.notHere}</Pill>}
          <ExternalLink href={thread.url} onOpen={openLink} className="ms-auto">
            {words.openOnGitHub}
          </ExternalLink>
        </>
      }
    >
      <Markdown text={first.body} onOpenLink={openLink} />
      {replies.map((reply) => (
        <div key={`${reply.author} ${reply.at}`} className="mt-2 flex flex-col gap-0.5">
          <p>
            <span className="font-medium">{reply.author}</span>{' '}
            <span className="text-muted-foreground">{ago(reply.at)}</span>
          </p>
          <Markdown text={reply.body} onOpenLink={openLink} />
        </div>
      ))}
    </DiffNote>
  );
}

/** The loading form, in a thread's own size: a file's name and two notes. */
function ReviewCommentsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-2">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
