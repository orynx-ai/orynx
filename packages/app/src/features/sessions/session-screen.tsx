// Design: docs/design/screens/session.html — page bar, title row, stepper, Claude's progress with the approval callout and the follow-up box, the Changes tab; spec 014's dialog and PR-open buttons: Design: none, settled in its Q10; the Context tab (in place of Ticket), the details held in view, the full-screen view, an Ask session's page with no stepper or Changes, and the session's buttons small in the page bar with Open in the editor and Discard changes in More actions (everything but Stop in it under 768 px): Design: none — the user's call, 19 Oct 2026; the approval callout under the last step, and Stop turning while Claude runs: Design: none — the user's call, 20 Oct 2026; no Open in Jira in the page bar (the Context tab keeps it): Design: none — the user's call, 20 Oct 2026
import { useCallback, useRef, type ReactNode } from 'react';
import { useParams } from '@tanstack/react-router';
import type { Session } from '@devhub/contracts';
import { PageBar, PageBody, PageBreadcrumb, type Crumb } from '../../shell/page-frame.tsx';
import { NotFoundScreen } from '../not-found/not-found-screen.tsx';
import { ChangesSkeleton } from './components/changes-panel.tsx';
import { contextOf } from './components/context-panel.tsx';
import { FollowUpBox } from './components/follow-up-box.tsx';
import { NextMove } from './components/next-move.tsx';
import { SessionDetails } from './components/session-details.tsx';
import { SessionActions, SessionHeader, SessionHeaderSkeleton } from './components/session-header.tsx';
import {
  SessionProgress,
  SessionProgressSkeleton,
  SessionStepper,
  SessionStepperSkeleton,
} from './components/session-progress.tsx';
import { SessionsLoadError } from './components/sessions-load-error.tsx';
import { useSession } from './queries.ts';
import { sourceLabel } from './source-label.ts';

const sessionsCrumb = { label: 'Sessions', to: '/sessions' } as const;

/** Tickets / the sprint / the key when the ticket was in a sprint, otherwise Sessions / the key (Q9e). */
function crumbsFor(session: Session): Crumb[] {
  const last = { label: sourceLabel(session.source) ?? session.title };
  return session.sprint === null
    ? [sessionsCrumb, last]
    : [{ label: 'Tickets', to: '/tickets' }, { label: session.sprint, to: '/tickets' }, last];
}

/**
 * Claude's progress and the work beside it (spec 013, Q6): side by side when there's room, each its own height,
 * the progress first when they stack. As `session.html` sizes them: 360 and 480 px to start, grown 2 to 3. Side
 * by side, the details stay in view under the page bar while the progress scrolls, and scroll on their own (the
 * user's call, 19 Oct 2026).
 */
function Panes({ progress, details }: { progress: ReactNode; details: ReactNode }) {
  return (
    // A container, so the loading form can tell side by side (896 px and up) from stacked.
    <div className="@container flex flex-wrap items-start gap-5">
      <div className="min-w-0 grow-2 basis-90">{progress}</div>
      {/* An Ask session that was sent nothing has no details: the progress takes the width (spec 026). */}
      {details === null ? null : (
        <section
          aria-label="Work details"
          // 24 px under the 56 px page bar, and as tall as the window less those 80 px and 32 px under it.
          // style-policy-ignore-next-line: the window's height less the page bar and its gaps has no scale step
          className="min-w-0 grow-3 basis-120 @4xl:sticky @4xl:top-20 @4xl:flex @4xl:max-h-[calc(100svh-7rem)] @4xl:flex-col"
        >
          {details}
        </section>
      )}
    </div>
  );
}

/**
 * The title and its line, with the stepper on their right where there's room and under them where there isn't (spec
 * 048, Q3). Beside the title the stepper keeps the 36rem it needs to show every step's words, so the row goes side by
 * side from 64rem.
 */
function TitleRow({ header, stepper }: { header: ReactNode; stepper: ReactNode }) {
  return (
    <div className="@container">
      <div className="flex flex-col gap-3 @5xl:flex-row @5xl:items-start @5xl:gap-6">
        <div className="min-w-0 @5xl:flex-1">{header}</div>
        {stepper === null ? null : <div className="@5xl:w-144 @5xl:shrink-0 @5xl:pt-1">{stepper}</div>}
      </div>
    </div>
  );
}

/** One Claude session (specs 011 to 013): where it is, what Claude has done and changed, and Stop. */
export function SessionScreen() {
  const { sessionId } = useParams({ from: '/sessions/$sessionId' });
  const session = useSession(sessionId);
  // Stop and Discard hand focus to the title once their buttons are gone.
  const title = useRef<HTMLHeadingElement>(null);
  // Once the pull request opens or a push lands, focus goes to Open PR, or More actions, where it is under 768 px
  // (spec 014, AC-4).
  const openPullRequest = useRef<HTMLAnchorElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const focusPullRequest = useCallback(() => {
    (openPullRequest.current ?? more.current)?.focus();
  }, []);

  if (session.isPending) {
    return (
      <>
        <PageBar breadcrumb={<PageBreadcrumb crumbs={[sessionsCrumb]} />} />
        <PageBody width="full" aria-busy>
          <TitleRow header={<SessionHeaderSkeleton />} stepper={<SessionStepperSkeleton />} />
          <Panes
            progress={<SessionProgressSkeleton />}
            details={
              // The tabs' row, then the Changes tab's own loading form; only beside the progress. Stacked under
              // it, the progress's real length would push it down, so the details appear once they've loaded.
              <div aria-hidden className="flex flex-col gap-3 @max-4xl:hidden">
                <div className="h-12 border-b border-border" />
                <ChangesSkeleton />
              </div>
            }
          />
        </PageBody>
      </>
    );
  }

  if (session.isError) {
    return (
      <>
        <PageBar breadcrumb={<PageBreadcrumb crumbs={[sessionsCrumb]} />} />
        <PageBody>
          <SessionsLoadError onRetry={() => void session.refetch()} />
        </PageBody>
      </>
    );
  }

  if (session.data === null) return <NotFoundScreen />;

  const found = session.data;
  return (
    <>
      <PageBar
        breadcrumb={<PageBreadcrumb crumbs={crumbsFor(found)} />}
        actions={<SessionActions session={found} title={title} openPullRequest={openPullRequest} more={more} />}
      />
      <PageBody width="full">
        <TitleRow
          header={<SessionHeader session={found} title={title} />}
          // The steps follow what the session does: an Ask session plans, builds and opens nothing (spec 026).
          // On the title's right, its steps end at the row's end, as `session-review.html` draws them.
          stepper={found.mode === 'ask' ? null : <SessionStepper session={found} className="@5xl:justify-end" />}
        />
        <NextMove session={found} focusPullRequest={focusPullRequest} />
        <Panes
          progress={<SessionProgress session={found} footer={<FollowUpBox session={found} />} />}
          details={found.mode === 'ask' && contextOf(found).length === 0 ? null : <SessionDetails session={found} />}
        />
      </PageBody>
    </>
  );
}
