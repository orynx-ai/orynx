// Design: docs/design/screens/tickets.html — page bar, filter toolbar, board and list
import { useRef } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { List, SquareKanban } from 'lucide-react';
import { Button, EmptyState, SearchField, SegmentedControl, SegmentedControlItem } from '@devhub/ui';
import { PageBar, PageBody, PageBreadcrumb, type Crumb } from '../../shell/page-frame.tsx';
import { useNow } from '../../words/use-now.ts';
import { TicketsBoard } from './components/tickets-board.tsx';
import { TicketsToolbar } from './components/tickets-toolbar.tsx';
import { defaultFilters, filtersFromSearch, matches, searchFromFilters, type AddressFilters } from './filters.ts';
import { useTickets } from './queries.ts';
import { useTicketsStore } from './store.ts';
import { pageHeading, sprintMeta } from './ticket-words.ts';

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

  const { data } = tickets;
  if (data?.jira.state === 'not_connected') return <JiraNotConnected />;

  const sprint = data?.sprint ?? null;
  const filters = { ...filtersFromSearch(search), text };
  const all = data?.tickets ?? [];
  const shown = all.filter((ticket) => matches(ticket, filters, now));
  // Assigned to me alone, so an empty column can say whether the other filters emptied it (Q9d).
  const unfiltered = all.filter((ticket) => matches(ticket, { ...defaultFilters, mine: filters.mine }, now));
  const crumbs: Crumb[] =
    sprint === null ? [{ label: 'Tickets' }] : [{ label: 'Tickets', to: '/tickets' }, { label: sprint.name }];

  function changeFilters(next: AddressFilters) {
    void navigate({ search: searchFromFilters(next), replace: true });
  }

  function clearFilters() {
    form.reset();
    changeFilters(defaultFilters);
    assignedToMe.current?.focus();
  }

  return (
    <>
      <PageBar
        breadcrumb={<PageBreadcrumb crumbs={crumbs} />}
        meta={sprint === null ? undefined : (sprintMeta(sprint, now) ?? undefined)}
        actions={
          <>
            <SearchField
              size="sm"
              aria-label="Search tickets"
              placeholder="Search tickets"
              className="w-55"
              {...form.register('text')}
            />
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
        count={data === undefined ? undefined : shown.length}
        assignedToMeRef={assignedToMe}
      />
      <PageBody width="full">
        <h1 className="sr-only">{sprint === null ? 'Tickets' : pageHeading(sprint.name)}</h1>
        {data === undefined || view !== 'board' ? null : (
          <TicketsBoard shown={shown} unfiltered={unfiltered} now={now} />
        )}
      </PageBody>
    </>
  );
}

function JiraNotConnected() {
  return (
    <>
      <PageBar breadcrumb={<PageBreadcrumb crumbs={[{ label: 'Tickets' }]} />} />
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
