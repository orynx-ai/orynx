// Design: docs/design/screens/tickets.html — page bar, filter toolbar, board and list
import { useRef, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { List, SquareKanban } from 'lucide-react';
import type { InboxToolState } from '@devhub/contracts';
import { Button, EmptyState, SearchField, SegmentedControl, SegmentedControlItem } from '@devhub/ui';
import { PageBar, PageBody, PageBreadcrumb, type Crumb } from '../../shell/page-frame.tsx';
import { useWide } from '../../shell/use-wide.ts';
import { toolLine } from '../../words/tool-line.ts';
import { useNow } from '../../words/use-now.ts';
import { TicketsBoard, TicketsBoardSkeleton } from './components/tickets-board.tsx';
import { TicketsList, TicketsListSkeleton } from './components/tickets-list.tsx';
import { TicketsToolbar } from './components/tickets-toolbar.tsx';
import {
  defaultFilters,
  filtersFromSearch,
  hasExtraFilters,
  matches,
  searchFromFilters,
  type AddressFilters,
} from './filters.ts';
import { useTickets } from './queries.ts';
import { useTicketsStore } from './store.ts';
import { noSprintText, pageHeading, sprintMeta, tooManyLine, unreachableText } from './ticket-words.ts';

const ticketsCrumb: Crumb = { label: 'Tickets' };

/** Your current Jira sprint as a board or a list (spec 008). */
export function TicketsScreen() {
  const tickets = useTickets();
  const search = useSearch({ from: '/tickets' });
  const navigate = useNavigate({ from: '/tickets' });
  const view = useTicketsStore((state) => state.view);
  const setView = useTicketsStore((state) => state.setView);
  // The search box narrows this page only, and isn't kept in the address (Q3e).
  const form = useForm<{ text: string }>({ defaultValues: { text: '' } });
  const text = useWatch({ control: form.control, name: 'text' });
  const assignedToMe = useRef<HTMLButtonElement>(null);
  const now = useNow();
  const wide = useWide();

  const { data } = tickets;
  if (data === undefined && tickets.isError) {
    return (
      <Unreachable
        pending={tickets.isFetching}
        onRetry={() => {
          void tickets.refetch();
        }}
      />
    );
  }
  if (data?.jira.state === 'not_connected') return <JiraNotConnected />;

  // Loading until the first sync has read the sprint (Q8a); after that the cache always answers.
  const loading = data === undefined || data.jira.state === 'syncing';
  const sprint = data?.sprint ?? null;
  if (!loading && sprint === null) return <NoSprint jira={data.jira} now={now} />;

  const filters = { ...filtersFromSearch(search), text };
  const all = data?.tickets ?? [];
  const shown = all.filter((ticket) => matches(ticket, filters, now));
  // Assigned to me alone, so an empty column can say whether the other filters emptied it (Q9d).
  const unfiltered = all.filter((ticket) => matches(ticket, { ...defaultFilters, mine: filters.mine }, now));
  const crumbs: Crumb[] =
    sprint === null ? [ticketsCrumb] : [{ ...ticketsCrumb, to: '/tickets' }, { label: sprint.name }];
  const line = data === undefined ? null : toolLine('jira', data.jira, now);

  function changeFilters(next: AddressFilters) {
    void navigate({ search: searchFromFilters(next), replace: true });
  }

  function clearFilters() {
    form.reset();
    changeFilters(defaultFilters);
    assignedToMe.current?.focus();
  }

  // One search field: in the page bar from 768 px, as the design draws it, and at the start of the toolbar
  // below that, so the page bar keeps to one line (Q8g).
  const searchField = (
    <SearchField
      size="sm"
      aria-label="Search tickets"
      placeholder="Search tickets"
      className={wide ? 'w-55' : 'w-full'}
      {...form.register('text')}
    />
  );

  let body: ReactNode;
  if (sprint === null) {
    body = view === 'board' ? <TicketsBoardSkeleton /> : <TicketsListSkeleton />;
  } else if (view === 'board') {
    body = <TicketsBoard shown={shown} unfiltered={unfiltered} now={now} />;
  } else {
    body = (
      <TicketsList
        shown={shown}
        sprintName={sprint.name}
        filtered={hasExtraFilters(filters)}
        onlyMine={filters.mine}
        now={now}
      />
    );
  }

  return (
    <>
      <PageBar
        breadcrumb={<PageBreadcrumb crumbs={crumbs} />}
        meta={sprint === null ? undefined : (sprintMeta(sprint, now) ?? undefined)}
        actions={
          <>
            {wide ? searchField : null}
            <SegmentedControl
              aria-label="View"
              value={view}
              onValueChange={(picked) => {
                if (picked === 'board' || picked === 'list') setView(picked);
              }}
            >
              <SegmentedControlItem value="board">
                <SquareKanban aria-hidden />
                Board
              </SegmentedControlItem>
              <SegmentedControlItem value="list">
                <List aria-hidden />
                List
              </SegmentedControlItem>
            </SegmentedControl>
          </>
        }
      />
      <TicketsToolbar
        filters={filters}
        onFiltersChange={changeFilters}
        onClear={clearFilters}
        count={loading ? undefined : shown.length}
        assignedToMeRef={assignedToMe}
        {...(wide ? {} : { search: searchField })}
      />
      <PageBody width="full">
        <h1 className="sr-only">{sprint === null ? 'Tickets' : pageHeading(sprint.name)}</h1>
        {line === null && data?.truncated !== true ? null : (
          <div className="flex flex-col gap-1">
            {line === null ? null : <Note message={line.message} action={line.action} />}
            {sprint !== null && data?.truncated === true ? (
              <Note message={tooManyLine(sprint.name)} action={null} />
            ) : null}
          </div>
        )}
        {body}
      </PageBody>
    </>
  );
}

/**
 * One quiet line above the sprint (Q8d, Q8h): a sync that failed, in 007's words, or a sprint cut short.
 * A link after it goes to a Settings tab.
 */
function Note({ message, action }: { message: string; action: { text: string; tab: 'connections' } | null }) {
  return (
    <p className="m-0 text-small text-muted-foreground">
      {message}
      {action === null ? null : (
        <>
          {' '}
          <Link to="/settings/$tab" params={{ tab: action.tab }} className="text-info underline">
            {action.text}
          </Link>
          .
        </>
      )}
    </p>
  );
}

/** Q8c: Jira answered, and no active sprint holds a ticket of yours; or its sync failed before it said. */
function NoSprint({ jira, now }: { jira: InboxToolState; now: Date }) {
  const line = toolLine('jira', jira, now);
  // A sync that failed before Jira ever answered can't say whether there's a sprint.
  const answered = jira.state === 'synced' || (jira.state === 'failed' && jira.lastSyncedAt !== null);
  return (
    <>
      <PageBar breadcrumb={<PageBreadcrumb crumbs={[ticketsCrumb]} />} />
      <PageBody>
        <h1 className="sr-only">Tickets</h1>
        {line === null ? null : <Note message={line.message} action={line.action} />}
        {answered ? (
          <EmptyState title={noSprintText.title}>
            <span>{noSprintText.line}</span>
          </EmptyState>
        ) : null}
      </PageBody>
    </>
  );
}

/** Q8e: the local server didn't answer. The sidebar and page bar keep working. */
function Unreachable({ pending, onRetry }: { pending: boolean; onRetry: () => void }) {
  return (
    <>
      <PageBar breadcrumb={<PageBreadcrumb crumbs={[ticketsCrumb]} />} />
      <PageBody>
        <EmptyState
          title={unreachableText.title}
          action={
            <Button size="sm" pending={pending} onClick={onRetry}>
              {unreachableText.action}
            </Button>
          }
        >
          <span>{unreachableText.line}</span>
        </EmptyState>
      </PageBody>
    </>
  );
}

function JiraNotConnected() {
  return (
    <>
      <PageBar breadcrumb={<PageBreadcrumb crumbs={[ticketsCrumb]} />} />
      <PageBody>
        <EmptyState
          title="Jira is not connected"
          action={
            <Button asChild size="sm">
              <Link to="/settings/$tab" params={{ tab: 'connections' }}>
                Open Settings
              </Link>
            </Button>
          }
        >
          <span>Connect it in Settings to see your sprint.</span>
        </EmptyState>
      </PageBody>
    </>
  );
}
