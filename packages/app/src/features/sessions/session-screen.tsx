// Design: docs/design/screens/session.html — page bar, title row with Stop Claude, stepper, Claude's progress with the approval callout (full width until 013), Discard changes
import { useRef } from 'react';
import { useParams } from '@tanstack/react-router';
import type { Session } from '@devhub/contracts';
import { ExternalLink } from '@devhub/ui';
import { usePlatform } from '../../platform.tsx';
import { PageBar, PageBody, PageBreadcrumb, type Crumb } from '../../shell/page-frame.tsx';
import { agoText } from '../../words/ago.ts';
import { useNow } from '../../words/use-now.ts';
import { NotFoundScreen } from '../not-found/not-found-screen.tsx';
import { ChangesPanel } from './components/changes-panel.tsx';
import { FollowUpBox } from './components/follow-up-box.tsx';
import { TicketPanel } from './components/ticket-panel.tsx';
import { SessionHeader, SessionHeaderSkeleton } from './components/session-header.tsx';
import { SessionProgress, SessionProgressSkeleton, SessionStepper } from './components/session-progress.tsx';
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

/** One Claude session (spec 011): where it is, what Claude has done, and Stop. */
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
        <PageBody aria-busy>
          <SessionHeaderSkeleton />
          <SessionProgressSkeleton />
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
      <PageBody>
        <SessionHeader session={found} title={title} />
        <SessionStepper session={found} />
        <SessionProgress session={found} footer={<FollowUpBox session={found} />} />
        <ChangesPanel session={found} title={title} />
        {/* The Ticket tab's content, until the tabs come (spec 013, task 27). */}
        <section aria-label={`Ticket ${sourceLabel(found.source) ?? ''}`.trim()}>
          <TicketPanel session={found} />
        </section>
      </PageBody>
    </>
  );
}
