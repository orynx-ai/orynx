import { useEffect, useRef } from 'react';
import type { Session } from '@devhub/contracts';
import { Callout } from '@devhub/ui';
import { nextMoveWords } from '../pull-request-words.ts';
import { useHasChanges, useSessionChanges } from '../queries.ts';
import { CreatePullRequest } from './create-pull-request.tsx';
import { PushChanges } from './push-changes.tsx';

/**
 * Create pull request shows once Claude isn't working, while the worktree is there and no pull request is open
 * (spec 014, Q2): Done, or Stopped after Stop, an error or Orynx closing.
 */
function canCreatePullRequest(session: Session): boolean {
  const working = session.state === 'working' || session.state === 'needs_you';
  return !working && session.pullRequest === null && session.discardedAt === null && session.worktreePath !== null;
}

/**
 * Push shows once a pull request is open, whenever Claude isn't working and the worktree is there (Q7), until
 * origin's branch has everything, whoever pushed it.
 */
function canPush(session: Session): boolean {
  const working = session.state === 'working' || session.state === 'needs_you';
  return !working && session.discardedAt === null && session.worktreePath !== null && session.unpushed;
}

/**
 * The bar under the title that says what's yours to do next, with the page's one primary button (spec 048,
 * `session-review.html`): Ready to push, Ready for a pull request, or Pushed. It shows nothing while Claude works or
 * waits for you, since an approval waits under Claude's last step. Both buttons open today's dialogs (spec 014), which
 * stay open while the bar moves on. Once the pull request opens or a push lands, `focusPullRequest` moves focus on.
 */
export function NextMove({ session, focusPullRequest }: { session: Session; focusPullRequest: () => void }) {
  const changes = useSessionChanges(session.id);
  const hasChanges = useHasChanges(session.id);
  const { pullRequest } = session;
  const working = session.state === 'working' || session.state === 'needs_you';
  // Focus goes to Open PR once it shows, which is after Create's dialog has closed (spec 014, AC-4).
  const justOpened = useRef(false);
  useEffect(() => {
    if (pullRequest === null || !justOpened.current) return;
    justOpened.current = false;
    focusPullRequest();
  }, [pullRequest, focusPullRequest]);

  const offerCreate = canCreatePullRequest(session) && hasChanges;
  const offerPush = pullRequest !== null && canPush(session);
  const pushed = pullRequest !== null && !working && !session.unpushed && session.discardedAt === null;
  if (!offerCreate && !offerPush && !pushed) return null;

  const ready = changes.data?.state === 'ready' ? changes.data : null;
  const counts =
    ready === null ? null : { files: ready.files.length + ready.moreFiles, added: ready.added, removed: ready.removed };
  const look = offerPush
    ? { tone: 'warning' as const, title: nextMoveWords.readyToPush, line: nextMoveWords.changesLine(counts, 'push') }
    : offerCreate
      ? {
          tone: 'warning' as const,
          title: nextMoveWords.readyForPullRequest,
          line: nextMoveWords.changesLine(counts, 'create'),
        }
      : {
          tone: 'success' as const,
          title: nextMoveWords.pushed(pullRequest?.number ?? 0),
          line: nextMoveWords.pushedLine,
        };
  return (
    <Callout
      role="status"
      aria-label={look.title}
      tone={look.tone}
      title={look.title}
      // Both always, so a dialog that's open stays open as the bar moves on (spec 014, AC-4); each shows its button
      // only while it's offered.
      actions={
        <>
          <CreatePullRequest
            session={session}
            show={offerCreate}
            onOpened={() => {
              if (pullRequest === null) justOpened.current = true;
              else focusPullRequest();
            }}
          />
          {pullRequest === null ? null : (
            <PushChanges
              session={session}
              repository={pullRequest.repository}
              show={offerPush}
              onPushed={focusPullRequest}
            />
          )}
        </>
      }
    >
      <span className="text-small text-muted-foreground">{look.line}</span>
    </Callout>
  );
}
