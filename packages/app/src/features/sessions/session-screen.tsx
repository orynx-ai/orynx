// Design: docs/design/screens/session.html — page bar, title row with Stop Claude, stepper, Claude's progress (full width until 013), Discard changes
import { useRef } from 'react';
import { useParams } from '@tanstack/react-router';
import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons';
import type { Session } from '@devhub/contracts';
import { Button, Icon } from '@devhub/ui';
import { usePlatform } from '../../platform.tsx';
import { PageBar, PageBody, PageBreadcrumb, type Crumb } from '../../shell/page-frame.tsx';
import { agoText } from '../../words/ago.ts';
import { useNow } from '../../words/use-now.ts';
import { NotFoundScreen } from '../not-found/not-found-screen.tsx';
import { DiscardSession } from './components/discard-session.tsx';
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
    <Button asChild variant="ghost" size="sm">
      <a
        href={url}
        rel="noreferrer"
        onClick={(event) => {
          event.preventDefault();
          platform.openExternal(url);
        }}
      >
        Open in Jira
        <Icon icon={ArrowUpRight01Icon} aria-hidden />
      </a>
    </Button>
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
        <SessionProgress session={found} />
        <DiscardSession session={found} title={title} />
      </PageBody>
    </>
  );
}
