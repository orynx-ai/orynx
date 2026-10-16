import { Link } from '@tanstack/react-router';
import { SessionItem } from '@devhub/ui';
import { SessionsLoadError } from '../features/sessions/components/sessions-load-error.tsx';
import { useSessions } from '../features/sessions/queries.ts';
import { sourceLabel } from '../features/sessions/source-label.ts';

/** How many sessions the sidebar shows; "View all" lists the rest (design system: SidebarNav). */
const recentSessions = 5;

/** The Sessions section: the most recent sessions, newest activity first. */
export function SidebarSessions({ className }: { className?: string }) {
  const sessions = useSessions({ limit: recentSessions });

  return (
    <div className={className}>
      <div className="flex items-center gap-2 px-2.5 pt-2 pb-1 text-label font-medium text-muted-foreground">
        <h2 className="m-0 text-label font-medium">Sessions</h2>
        <Link
          to="/sessions"
          activeOptions={{ exact: true }}
          className="ml-auto rounded-xs px-1 text-muted-foreground no-underline hover:bg-subtle hover:text-foreground"
        >
          View all
        </Link>
      </div>
      {sessions.isPending ? null : sessions.isError ? (
        <SessionsLoadError className="py-1 pl-2.5" onRetry={() => void sessions.refetch()} />
      ) : sessions.data.sessions.length === 0 ? (
        <p className="m-0 px-2.5 py-2 text-small text-muted-foreground">No sessions yet</p>
      ) : (
        sessions.data.sessions.map((session) => (
          <SessionItem
            key={session.id}
            asChild
            title={session.title}
            source={sourceLabel(session.source)}
            state={session.state}
          >
            <Link to="/sessions/$sessionId" params={{ sessionId: session.id }} />
          </SessionItem>
        ))
      )}
    </div>
  );
}
