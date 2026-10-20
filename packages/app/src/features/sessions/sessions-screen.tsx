// Design: none — the spec's "View all" list has no screen design; reuses the page frame, SessionItem and EmptyState
import { Link } from '@tanstack/react-router';
import { EmptyState, SessionItem } from '@devhub/ui';
import { PageBar, PageBody, PageBreadcrumb } from '../../shell/page-frame.tsx';
import { SessionsLoadError } from './components/sessions-load-error.tsx';
import { useSessions } from './queries.ts';
import { sourceLabel } from './source-label.ts';

/** Every Claude session, newest activity first (spec 001, Q8). */
export function SessionsScreen() {
  const sessions = useSessions();

  return (
    <>
      <PageBar breadcrumb={<PageBreadcrumb crumbs={[{ label: 'Sessions' }]} />} />
      <PageBody>
        {/* The page bar shows "Sessions"; the heading names the page for screen readers too. */}
        <h1 className="sr-only">Sessions</h1>
        {sessions.isPending ? null : sessions.isError ? (
          <SessionsLoadError onRetry={() => void sessions.refetch()} />
        ) : sessions.data.sessions.length === 0 ? (
          <EmptyState title="No sessions yet">
            <span>Start one from Home or from a ticket.</span>
          </EmptyState>
        ) : (
          <ul aria-label="Sessions" className="m-0 flex list-none flex-col gap-0.5 p-0">
            {sessions.data.sessions.map((session) => (
              <li key={session.id}>
                <SessionItem
                  asChild
                  title={session.title}
                  source={sourceLabel(session.source)}
                  state={session.state}
                  ready={session.ready}
                >
                  <Link to="/sessions/$sessionId" params={{ sessionId: session.id }} />
                </SessionItem>
              </li>
            ))}
          </ul>
        )}
      </PageBody>
    </>
  );
}
