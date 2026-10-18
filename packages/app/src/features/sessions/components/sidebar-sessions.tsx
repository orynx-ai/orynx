import { Link } from '@tanstack/react-router';
import { SessionItem } from '@devhub/ui';
import { SessionsLoadError } from './sessions-load-error.tsx';
import { useSessions } from '../queries.ts';
import { sourceLabel } from '../source-label.ts';

/** How many sessions the sidebar shows; "View all" lists the rest (design system: SidebarNav). */
const recentSessions = 5;

/** The sidebar's Sessions section (the shell places it): the most recent sessions, newest activity first. */
export function SidebarSessions({ className }: { className?: string }) {
  // Recent ones only: a session discarded more than 7 days ago leaves the sidebar (spec 011, product spec).
  const sessions = useSessions({ limit: recentSessions, recent: true });

  return (
    <div className={className}>
      <div className="flex items-center gap-2 ps-3 pe-2 pb-1 text-small text-muted-foreground">
        <h2 className="m-0 text-small font-normal">Sessions</h2>
        <Link
          to="/sessions"
          activeOptions={{ exact: true }}
          // A 32 px hit area (dense rows) without moving the heading row.
          className="-my-1.5 ms-auto rounded-xs px-1 py-1.5 text-muted-foreground no-underline hover:bg-subtle hover:text-foreground aria-[current=page]:text-foreground"
        >
          View all
        </Link>
      </div>
      {sessions.isPending ? null : sessions.isError ? (
        <SessionsLoadError className="py-1 ps-3" onRetry={() => void sessions.refetch()} />
      ) : sessions.data.sessions.length === 0 ? (
        <p className="m-0 px-3 py-2 text-small text-muted-foreground">No sessions yet</p>
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
