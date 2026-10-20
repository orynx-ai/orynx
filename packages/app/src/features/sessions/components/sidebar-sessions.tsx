import { useCallback, useId, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import type { SessionSummary } from '@devhub/contracts';
import { SessionItem, SessionItemSkeleton } from '@devhub/ui';
import { SessionMenu } from './session-menu.tsx';
import { SessionsLoadError } from './sessions-load-error.tsx';
import { useSessionPages, useSessions } from '../queries.ts';
import { sourceLabel } from '../source-label.ts';

/** How many sessions each page of the sidebar holds; the next page loads at the list's end (spec 020). */
const pageSize = 16;

/**
 * The sidebar's Sessions section (the shell places it): every recent session, newest activity first, 16 at a
 * time. When the end of the list scrolls into view, the next 16 load under it (spec 020). The shell makes
 * the section scroll inside the sidebar, and the browser says when its end is in view.
 */
export function SidebarSessions({ className }: { className?: string }) {
  // Recent ones only: a session discarded more than 7 days ago leaves the sidebar (spec 011, product spec). The pinned
  // ones come whole, first, and the pages hold the rest, so a pin on a later page still sits at the top (spec 039).
  const pinned = useSessions({ recent: true, pinned: true });
  const sessions = useSessionPages({ limit: pageSize, recent: true, pinned: false });
  const pinnedId = useId();
  const recentId = useId();
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = sessions;

  // Watches the list's end while there's more to load; a new watch starts after each page, so a short page
  // whose end is still in view loads the next one too. A failed page waits for Try again.
  const watchEnd = useCallback(
    (end: HTMLElement | null) => {
      if (end === null || !hasNextPage || isFetchingNextPage || isFetchNextPageError) return;
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void fetchNextPage();
      });
      observer.observe(end);
      return () => {
        observer.disconnect();
      };
    },
    [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage],
  );

  const rows = sessions.data?.pages.flatMap((page) => page.sessions) ?? [];
  // Where focus goes once a session is deleted from its ⋯, since its row is gone (spec 039, AC-32).
  const viewAll = useRef<HTMLAnchorElement>(null);
  const pinnedRows = pinned.data?.sessions ?? [];
  const row = (session: SessionSummary) => (
    <li key={session.id}>
      <SessionItem
        asChild
        size="sm"
        title={session.title}
        source={sourceLabel(session.source)}
        state={session.state}
        ready={session.ready}
        actions={<SessionMenu session={session} afterDelete={() => viewAll.current?.focus()} />}
      >
        <Link to="/sessions/$sessionId" params={{ sessionId: session.id }} />
      </SessionItem>
    </li>
  );

  return (
    <div className={className}>
      {pinnedRows.length === 0 ? null : (
        <>
          <h2 id={pinnedId} className="m-0 ps-2.5 pb-1 text-label font-normal text-muted-foreground">
            Pinned
          </h2>
          <ul aria-labelledby={pinnedId} className="m-0 mb-3 flex list-none flex-col gap-0.5 p-0">
            {pinnedRows.map(row)}
          </ul>
        </>
      )}
      <div className="flex items-center gap-2 ps-2.5 pe-2 pb-1 text-label text-muted-foreground">
        <h2 id={recentId} className="m-0 text-label font-normal">
          Sessions
        </h2>
        <Link
          ref={viewAll}
          to="/sessions"
          activeOptions={{ exact: true }}
          // A 32 px hit area (dense rows) without moving the heading row.
          className="-my-1.5 ms-auto rounded-xs px-1 py-1.5 text-muted-foreground no-underline hover:bg-subtle hover:text-foreground aria-[current=page]:text-foreground"
        >
          View all
        </Link>
      </div>
      {sessions.isPending ? null : sessions.data === undefined ? (
        // The first page failed; a later page that fails keeps the rows above its own line.
        <SessionsLoadError className="py-1 ps-3" onRetry={() => void sessions.refetch()} />
      ) : rows.length === 0 ? (
        <p className="m-0 px-2.5 py-1.5 text-small text-muted-foreground">
          {pinnedRows.length === 0 ? 'No sessions yet' : 'No other sessions'}
        </p>
      ) : (
        <>
          <ul aria-labelledby={recentId} className="m-0 flex list-none flex-col gap-0.5 p-0">
            {rows.map(row)}
          </ul>
          {isFetchNextPageError ? (
            <SessionsLoadError className="py-1 ps-3" onRetry={() => void fetchNextPage()} />
          ) : isFetchingNextPage ? (
            <div role="status">
              <span className="sr-only">Loading more sessions</span>
              <SessionItemSkeleton size="sm" />
              <SessionItemSkeleton size="sm" />
            </div>
          ) : hasNextPage ? (
            // The list's end: once it scrolls into view, the next page loads. Nothing to see or reach.
            <div ref={watchEnd} aria-hidden className="h-px shrink-0" />
          ) : null}
        </>
      )}
    </div>
  );
}
