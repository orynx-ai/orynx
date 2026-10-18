// Design: docs/design/screens/session.html — page bar, title row with Stop Claude, stepper, Claude's progress with the approval callout and the follow-up box, the Changes and Ticket tabs
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
 * the progress first when they stack. As `session.html` sizes them: 360 and 480 px to start, grown 2 to 3.
 */
function Panes({ progress, details }: { progress: ReactNode; details: ReactNode }) {
  return (
    // A container, so the loading form can tell side by side (896 px and up) from stacked.
    <div className="@container flex flex-wrap items-start gap-5">
      <div className="min-w-0 grow-2 basis-90">{progress}</div>
      <section aria-label="Work details" className="min-w-0 grow-3 basis-120">
        {details}
      </section>
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
        <SessionStepper session={found} />
        <Panes
          progress={<SessionProgress session={found} footer={<FollowUpBox session={found} />} />}
          details={<SessionDetails session={found} title={title} />}
        />
      </PageBody>
    </>
  );
}
