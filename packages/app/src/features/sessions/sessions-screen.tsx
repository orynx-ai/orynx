// Design: none — the spec's "View all" list has no screen design; reuses the page frame, SessionItem, EmptyState, and Tickets' search and filters (spec 039)
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import type { SessionSummary } from '@devhub/contracts';
import { Button, CheckboxBox, EmptyState, FilterMenu, SearchField, SessionItem, SessionItemSkeleton } from '@devhub/ui';
import { PageBar, PageBody, PageBreadcrumb, Toolbar } from '../../shell/page-frame.tsx';
import { RecentSearchBox } from '../../shell/recent-search-box.tsx';
import { useRecentSearches } from '../../stores/recent-searches.ts';
import { DeleteSessions } from './components/delete-sessions.tsx';
import { SessionMenu } from './components/session-menu.tsx';
import { SessionsLoadError } from './components/sessions-load-error.tsx';
import { useSessions } from './queries.ts';
import {
  hasSessionFilters,
  kindOptions,
  matchesSession,
  noSessionFilters,
  searchFromSessionFilters,
  sessionFiltersFromSearch,
  statusOptions,
  type SessionFilters,
} from './session-filters.ts';
import { sourceLabel } from './source-label.ts';

/**
 * Every Claude session, newest activity first (spec 001, Q8), with Search sessions, Status and Kind over them, kept in
 * the address, and the pinned ones first (spec 039). Each row has its ⋯ menu, as in the sidebar. Select gives each row
 * a checkbox, and Delete takes the ones picked after one confirm (the user's call, 22 Oct 2026); one Claude is working
 * on can't be picked, as its own Delete waits for Stop.
 * shortcut: reads every session and filters them here; move the search to the server once someone keeps thousands.
 */
export function SessionsScreen() {
  const sessions = useSessions();
  const search = useSearch({ from: '/sessions' });
  const navigate = useNavigate({ from: '/sessions' });
  const filters = sessionFiltersFromSearch(search);
  const box = useRef<HTMLInputElement | null>(null);
  const form = useForm<{ q: string }>({ defaultValues: { q: filters.q } });
  const pinnedId = useId();
  const recentId = useId();
  // A search counts once you press Enter, or open a session it found (spec 039, AC-21).
  const remember = useRecentSearches((state) => state.remember);
  const [selecting, setSelecting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const picks = useForm<{ ids: string[] }>({ defaultValues: { ids: [] } });
  const ids = useWatch({ control: picks.control, name: 'ids' });
  const stopSelecting = () => {
    setSelecting(false);
    picks.reset();
  };

  const change = (next: SessionFilters) => {
    void navigate({ search: searchFromSessionFilters(next), replace: true });
  };
  const clear = () => {
    form.setValue('q', '');
    change(noSessionFilters);
    box.current?.focus();
  };

  const all = sessions.data?.sessions ?? [];
  const shown = all.filter((session) => matchesSession(session, filters));
  const pinned = shown
    .filter((session) => session.pinnedAt !== null)
    .sort((a, b) => Date.parse(a.pinnedAt ?? '') - Date.parse(b.pinnedAt ?? ''));
  const rest = shown.filter((session) => session.pinnedAt === null);
  // Only the picked sessions that are still there: another tab may have deleted one meanwhile.
  const picked = ids.filter((id) => all.some((session) => session.id === id));
  const item = (session: SessionSummary) => (
    <SessionItem
      asChild
      title={session.title}
      source={sourceLabel(session.source)}
      state={session.state}
      ready={session.ready}
      actions={<SessionMenu session={session} afterDelete={() => box.current?.focus()} />}
    >
      <Link
        to="/sessions/$sessionId"
        params={{ sessionId: session.id }}
        onClick={() => {
          remember('sessions', filters.q);
        }}
      />
    </SessionItem>
  );
  const row = (session: SessionSummary) => {
    if (!selecting) return <li key={session.id}>{item(session)}</li>;
    const working = session.state === 'working' || session.state === 'needs_you';
    return (
      <li key={session.id} className="flex items-center gap-1 ps-3">
        <CheckboxBox
          aria-label={`Select ${session.title}`}
          checked={picked.includes(session.id)}
          disabled={working}
          onCheckedChange={(checked) => {
            const others = ids.filter((id) => id !== session.id);
            picks.setValue('ids', checked === true ? [...others, session.id] : others);
          }}
        />
        <div className="min-w-0 flex-1">{item(session)}</div>
      </li>
    );
  };

  return (
    <>
      <PageBar breadcrumb={<PageBreadcrumb crumbs={[{ label: 'Sessions' }]} />} />
      <Toolbar role="group" aria-label="Search and filters">
        <SessionSearch
          form={form}
          query={filters.q}
          searchRef={box}
          onQueryChange={(q) => {
            change({ ...filters, q });
          }}
          onSubmit={() => {
            remember('sessions', filters.q);
          }}
          onPick={(q) => {
            form.setValue('q', q);
            remember('sessions', q);
            change({ ...filters, q });
          }}
        />
        <FilterMenu
          label="Status"
          options={statusOptions}
          ticked={filters.status}
          onTickedChange={(ticked) => {
            change({ ...filters, status: statusOptions.map((o) => o.value).filter((v) => ticked.includes(v)) });
          }}
          size="sm"
        />
        <FilterMenu
          label="Kind"
          options={kindOptions}
          ticked={filters.kind}
          onTickedChange={(ticked) => {
            change({ ...filters, kind: kindOptions.map((o) => o.value).filter((v) => ticked.includes(v)) });
          }}
          size="sm"
        />
        <div className="ms-auto flex items-center gap-2">
          {/* When nothing matches, the page's own Clear filters says it, once. */}
          {hasSessionFilters(filters) && shown.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={clear}>
              Clear filters
            </Button>
          ) : null}
          {all.length === 0 ? null : selecting ? (
            <>
              <span role="status" className="text-small text-muted-foreground">
                {picked.length} selected
              </span>
              <Button
                variant="danger-ghost"
                size="sm"
                disabled={picked.length === 0}
                onClick={() => {
                  setConfirming(true);
                }}
              >
                Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={stopSelecting}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelecting(true);
              }}
            >
              Select
            </Button>
          )}
        </div>
      </Toolbar>
      <DeleteSessions
        ids={picked}
        open={confirming}
        onClose={() => {
          setConfirming(false);
        }}
        onDeleted={(gone) => {
          picks.setValue(
            'ids',
            ids.filter((id) => !gone.includes(id)),
          );
          if (gone.length === picked.length) setSelecting(false);
        }}
        afterDelete={() => box.current?.focus()}
      />
      <PageBody>
        {/* The page bar shows "Sessions"; the heading names the page for screen readers too. */}
        <h1 className="sr-only">Sessions</h1>
        {sessions.isPending ? (
          <div role="status" className="flex flex-col gap-0.5">
            <span className="sr-only">Loading sessions</span>
            <SessionItemSkeleton />
            <SessionItemSkeleton />
            <SessionItemSkeleton />
          </div>
        ) : sessions.isError ? (
          <SessionsLoadError onRetry={() => void sessions.refetch()} />
        ) : all.length === 0 ? (
          <EmptyState title="No sessions yet">
            <span>Start one from Home or from a ticket.</span>
          </EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState
            title="No sessions match"
            action={
              <Button size="sm" onClick={clear}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-6">
            {pinned.length === 0 ? null : (
              <section aria-labelledby={pinnedId} className="flex flex-col gap-1">
                <h2 id={pinnedId} className="m-0 ps-3 text-small font-normal text-muted-foreground">
                  Pinned
                </h2>
                <ul aria-labelledby={pinnedId} className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {pinned.map(row)}
                </ul>
              </section>
            )}
            {rest.length === 0 ? null : pinned.length === 0 ? (
              <ul aria-label="Sessions" className="m-0 flex list-none flex-col gap-0.5 p-0">
                {rest.map(row)}
              </ul>
            ) : (
              <section aria-labelledby={recentId} className="flex flex-col gap-1">
                <h2 id={recentId} className="m-0 ps-3 text-small font-normal text-muted-foreground">
                  Recent
                </h2>
                <ul aria-labelledby={recentId} className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {rest.map(row)}
                </ul>
              </section>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}

/**
 * Search sessions: results follow each key, and the address catches up (spec 039, AC-18). The box follows the address
 * when it changes without typing (Back, Clear filters), never while someone types in it.
 */
function SessionSearch({
  form,
  query,
  searchRef,
  onQueryChange,
  onSubmit,
  onPick,
}: {
  form: UseFormReturn<{ q: string }>;
  query: string;
  /** The box, for Clear filters and a delete to put focus back in it. */
  searchRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (query: string) => void;
  /** Enter: the search counts as one of your recent ones. */
  onSubmit: () => void;
  /** One of your recent searches, picked to run again. */
  onPick: (query: string) => void;
}) {
  const { ref, ...field } = form.register('q', {
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      onQueryChange(event.target.value);
    },
  });
  const boxRef = useCallback(
    (element: HTMLInputElement | null) => {
      ref(element);
      searchRef.current = element;
    },
    [ref, searchRef],
  );
  useEffect(() => {
    if (document.activeElement !== searchRef.current && form.getValues('q') !== query) form.setValue('q', query);
  }, [query, form, searchRef]);

  return (
    <form
      role="search"
      aria-label="Search sessions"
      className="w-full md:w-60"
      onSubmit={(event) => {
        // Results follow each key, so Enter only keeps the search among your recent ones.
        event.preventDefault();
        onSubmit();
      }}
    >
      <RecentSearchBox place="sessions" query={query} onPick={onPick} fieldRef={searchRef}>
        <SearchField
          size="sm"
          aria-label="Search sessions"
          placeholder="Search sessions"
          className="w-full"
          ref={boxRef}
          {...field}
        />
      </RecentSearchBox>
    </form>
  );
}
