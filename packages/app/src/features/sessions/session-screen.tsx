// Design: docs/design/screens/session.html — page bar, title row with Stop Claude and Create pull request (spec 014's dialog and PR-open row: Design: none, settled in its Q10), stepper, Claude's progress with the approval callout and the follow-up box, the Changes tab; the Context tab (in place of Ticket), the details held in view, the full-screen view and an Ask session's page with no stepper or Changes: Design: none — the user's call, 19 Oct 2026
import { useRef, type ReactNode } from 'react';
import { useParams } from '@tanstack/react-router';
import type { Session } from '@devhub/contracts';
import { ExternalLink } from '@devhub/ui';
import { usePlatform } from '../../platform.tsx';
import { PageBar, PageBody, PageBreadcrumb, type Crumb } from '../../shell/page-frame.tsx';
import { agoText } from '../../words/ago.ts';
import { useNow } from '../../words/use-now.ts';
import { NotFoundScreen } from '../not-found/not-found-screen.tsx';
import { ChangesSkeleton } from './components/changes-panel.tsx';
import { contextOf } from './components/context-panel.tsx';
import { FollowUpBox } from './components/follow-up-box.tsx';
import { SessionDetails } from './components/session-details.tsx';
import { SessionHeader, SessionHeaderSkeleton } from './components/session-header.tsx';
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

function OpenInJira({ url }: { url: string }) {
  const platform = usePlatform();
  return (
    // As tall as the bar's buttons, with their room around the text.
    <ExternalLink
      href={url}
      size="body"
      className="mx-0 min-h-8 px-2"
      onOpen={(href) => {
        platform.openExternal(href);
      }}
    >
      {/* Under 768 px only the arrow shows, so the breadcrumb keeps room for the ticket's key. */}
      <span className="max-md:sr-only">Open in Jira</span>
    </ExternalLink>
  );
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

/** One Claude session (specs 011 to 013): where it is, what Claude has done and changed, and Stop. */
export function SessionScreen() {
  const { sessionId } = useParams({ from: '/sessions/$sessionId' });
  const session = useSession(sessionId);
  const now = useNow();
  // Stop and Discard hand focus to the title once their buttons are gone.
  const title = useRef<HTMLHeadingElement>(null);

  if (session.isPending) {
    return (
      <>
        <PageBar breadcrumb={<PageBreadcrumb crumbs={[sessionsCrumb]} />} />
        <PageBody width="full" aria-busy>
          <SessionHeaderSkeleton />
          <SessionStepperSkeleton />
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
        meta={`Started ${agoText(now.getTime() - Date.parse(found.startedAt))}`}
        {...(found.jiraUrl === null ? {} : { actions: <OpenInJira url={found.jiraUrl} /> })}
      />
      <PageBody width="full">
        <SessionHeader session={found} title={title} />
        {/* The steps follow what the session does: an Ask session plans, builds and opens nothing (spec 026). */}
        {found.mode === 'ask' ? null : <SessionStepper session={found} />}
        <Panes
          progress={<SessionProgress session={found} footer={<FollowUpBox session={found} />} />}
          details={found.mode === 'ask' && contextOf(found).length === 0 ? null : <SessionDetails session={found} />}
        />
      </PageBody>
    </>
  );
}
