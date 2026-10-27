// Design: docs/design/screens/session-review.html — the title row with the stepper beside it, the next-move bar, What Claude did by step with its follow-up box at its foot, the panes scrolling on their own, and the Changes tab's file column, Wrap lines, Viewed and New file (spec 048); docs/design/screens/session.html — the states session-review.html doesn't draw: working, waiting for your approval, stopped, an Ask, and the stacked page; spec 014's dialogs: Design: none, settled in its Q10; the Context tab (in place of Ticket), the full-screen view, and Open in the editor and Delete in More actions (everything but Stop in it under 768 px): Design: none — the user's call, 19 Oct 2026; the approval callout under the last step, and Stop turning while Claude runs: Design: none — the user's call, 20 Oct 2026; no Open in Jira in the page bar (the Context tab keeps it): Design: none — the user's call, 20 Oct 2026
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
 * What Claude did and the work beside it (spec 013, Q6; spec 048, Q4): side by side once there's 48rem for them, What
 * Claude did 400 px wide and the tabs the rest, each held in view under the page bar and scrolling on its own, What
 * Claude did with its follow-up box at its foot. Narrower, they stack, What Claude did first, and the window scrolls.
 */
function Panes({ progress, details }: { progress: ReactNode; details: ReactNode }) {
  return (
    // A container, so each pane and the loading form can tell side by side (768 px and up) from stacked.
    <div className="@container">
      <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-start">
        {/* An Ask session that was sent nothing has no details: What Claude did takes the width (spec 026). */}
        <div className={details === null ? 'min-w-0' : 'min-w-0 @3xl:w-100 @3xl:shrink-0'}>{progress}</div>
        {details === null ? null : (
          <section
            aria-label="Work details"
            // 24 px under the 56 px page bar, and as tall as the window less those 80 px and 32 px under it.
            // style-policy-ignore-next-line: the window's height less the page bar and its gaps has no scale step
            className="min-w-0 @3xl:sticky @3xl:top-20 @3xl:flex @3xl:max-h-[calc(100svh-7rem)] @3xl:flex-1 @3xl:flex-col"
          >
            {details}
          </section>
        )}
      </div>
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
              <div aria-hidden className="flex flex-col gap-3 @max-3xl:hidden">
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
