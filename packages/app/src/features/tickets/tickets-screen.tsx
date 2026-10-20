// Design: docs/design/screens/tickets.html — page bar, filter toolbar (with spec 020's Project and Sprint pickers), board and list; Sync (Refresh until spec 039), the ticket checkboxes and the floating bar to Ship several: Design: none, the user's call (19 Oct 2026)
import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { KanbanIcon, LeftToRightListBulletIcon } from '@hugeicons/core-free-icons';
import { defaultTicketsChoice, isOrynxKey, type InboxToolState, type TicketsChoice } from '@devhub/contracts';
import { Button, Icon, EmptyState, SearchField, SegmentedControl, SegmentedControlItem } from '@devhub/ui';
import { PageBar, PageBody, PageBreadcrumb, type Crumb } from '../../shell/page-frame.tsx';
import { RecentSearchBox } from '../../shell/recent-search-box.tsx';
import { useRecentSearches } from '../../stores/recent-searches.ts';
import { useTicketDialogStore } from './ticket-dialog-store.ts';
import { useWide } from '../../shell/use-wide.ts';
import { toolLine } from '../../words/tool-line.ts';
import { useNow } from '../../words/use-now.ts';
import { TicketsBoard, TicketsBoardSkeleton } from './components/tickets-board.tsx';
import { TicketsList, TicketsListSkeleton } from './components/tickets-list.tsx';
import { SprintPickers } from './components/sprint-pickers.tsx';
import { TicketsToolbar } from './components/tickets-toolbar.tsx';
import { ShipSelected } from './components/ship-button.tsx';
import { NewTicketButton, NewTicketDialog, NewTicketInColumn } from './components/new-ticket.tsx';
import { SyncStatus } from '../home/components/sync-status.tsx';
import {
  defaultFilters,
  filterOptions,
  filtersFromSearch,
  hasExtraFilters,
  matches,
  searchFromFilters,
  type AddressFilters,
} from './filters.ts';
import { useStatus } from '../settings/queries.ts';
import { useTickets } from './queries.ts';
import { useTicketsStore } from './store.ts';
import {
  noOpenSprintsText,
  keptFileLine,
  noOrynxTicketsText,
  noSprintName,
  noSprintText,
  orynxName,
  withoutJiraLine,
  pageHeading,
  sprintMeta,
  tooManyLine,
  unreachableText,
} from './ticket-words.ts';

const ticketsCrumb: Crumb = { label: 'Tickets' };

/** Your current Jira sprint as a board or a list (spec 008). */
export function TicketsScreen() {
  const tickets = useTickets();
  const status = useStatus();
  const search = useSearch({ from: '/tickets' });
  const navigate = useNavigate({ from: '/tickets' });
  const view = useTicketsStore((state) => state.view);
  const setView = useTicketsStore((state) => state.setView);
  // The search box narrows this page only, and isn't kept in the address (Q3e).
  const form = useForm<{ text: string }>({ defaultValues: { text: '' } });
  const text = useWatch({ control: form.control, name: 'text' });
  const assignee = useRef<HTMLButtonElement>(null);
  const searchBox = useRef<HTMLInputElement | null>(null);
  // A search counts once you press Enter, or open a ticket while it's typed (spec 039, AC-45).
  const remember = useRecentSearches((state) => state.remember);
  const opened = useTicketDialogStore((state) => state.shown?.key ?? null);
  useEffect(() => {
    if (opened !== null) remember('tickets', form.getValues('text'));
  }, [opened, remember, form]);
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
  // Without Jira, Tickets holds Orynx's own tickets (spec 037, AC-4). Until the sprint's answer says so, the status the
  // shell has already read does, so the page is drawn without Jira's filters from the first paint and nothing moves.
  const jiraOff =
    data === undefined ? status.data?.integrations.jira.state === 'not_connected' : data.jira.state === 'not_connected';
  const filters = { ...filtersFromSearch(search), text };
  // Orynx's own tickets alone have no sprint, so the page names them and leaves the pickers out (spec 037, Q7).
  const orynxOnly = jiraOff || (filters.source.length === 1 && filters.source[0] === 'orynx');
  // New ticket and each column's + make Orynx tickets, so they go while Orynx's are filtered out (AC-2).
  const orynxShown = jiraOff || filters.source.length !== 1 || filters.source[0] === 'orynx';
  // Loading until the first sync has read the sprint (Q8a), or a new pick's (spec 020); after that the cache answers.
  const loading = data === undefined || (!orynxOnly && data.jira.state === 'syncing');
  const sprint = data?.sprint ?? null;
  const choice = data?.choice ?? defaultTicketsChoice;
  // No sprint shows its tickets with no sprint of their own (spec 020, AC-39).
  const withoutSprint = choice.sprintId === 'none';
  // Q8c: Jira answered and there's no sprint to show, or the picked project has none (spec 020, AC-28). The page
  // keeps its bar and pickers, the same elements, so a pick that empties or fills it keeps focus where it was.
  const noSprint = !orynxOnly && !loading && sprint === null && !withoutSprint;
  // What the page calls what it shows; null while it loads.
  // Orynx's own tickets alone are named Orynx from the first paint: they have no sprint to wait for.
  const shownName = orynxOnly ? orynxName : (sprint?.name ?? (withoutSprint && !loading ? noSprintName : null));

  const all = data?.tickets ?? [];
  const shown = all.filter((ticket) => matches(ticket, filters, now));
  // Assignee alone, so an empty column can say whether the other filters emptied it (Q9d).
  const unfiltered = all.filter((ticket) =>
    matches(ticket, { ...defaultFilters, source: filters.source, assignee: filters.assignee }, now),
  );
  const { text: _, ...address } = filters;
  const options = filterOptions(all, address);
  const crumbs: Crumb[] =
    shownName === null ? [ticketsCrumb] : [{ ...ticketsCrumb, to: '/tickets' }, { label: shownName }];
  // A line about Jira's sprint, unless the page shows Orynx's tickets alone by choice.
  const line = jiraOff ? withoutJiraLine : data === undefined || orynxOnly ? null : toolLine('jira', data.jira, now);
  const kept = data?.orynx.kept ?? null;
  const truncated = !orynxOnly && shownName !== null && data?.truncated === true;
  const noOrynxTickets = orynxOnly && !loading && !all.some((ticket) => isOrynxKey(ticket.key));

  function changeFilters(next: AddressFilters) {
    void navigate({ search: searchFromFilters(next), replace: true });
  }

  function clearFilters() {
    form.reset();
    changeFilters(defaultFilters);
    assignee.current?.focus();
  }

  // One search field: in the page bar from 768 px, as the design draws it, and at the start of the toolbar
  // below that, so the page bar keeps to one line (Q8g).
  const { ref: textRef, ...textField } = form.register('text');
  const searchField = (
    <RecentSearchBox
      place="tickets"
      query={text}
      fieldRef={searchBox}
      className={wide ? 'w-55' : 'w-full'}
      onPick={(picked) => {
        form.setValue('text', picked);
        remember('tickets', picked);
      }}
    >
      <SearchField
        size="sm"
        aria-label="Search tickets"
        placeholder="Search tickets"
        className="w-full"
        ref={(element) => {
          textRef(element);
          searchBox.current = element;
        }}
        {...textField}
        onKeyDown={(event) => {
          if (event.key === 'Enter') remember('tickets', form.getValues('text'));
        }}
      />
    </RecentSearchBox>
  );

  let body: ReactNode;
  if (noSprint) {
    body = <NoSprint jira={data.jira} choice={choice} />;
  } else if (noOrynxTickets) {
    body = <EmptyState title={noOrynxTicketsText} action={<NewTicketButton />} />;
  } else if (loading || shownName === null) {
    body = view === 'board' ? <TicketsBoardSkeleton /> : <TicketsListSkeleton />;
  } else if (view === 'board') {
    body = (
      <TicketsBoard
        shown={shown}
        unfiltered={unfiltered}
        now={now}
        addTo={orynxShown ? (column) => <NewTicketInColumn column={column} /> : undefined}
      />
    );
  } else {
    body = (
      <TicketsList
        shown={shown}
        sprintName={shownName}
        filtered={hasExtraFilters(filters)}
        onlyMine={filters.assignee.length === 1 && filters.assignee[0] === 'me'}
        now={now}
      />
    );
  }

  return (
    <>
      <PageBar
        breadcrumb={<PageBreadcrumb crumbs={crumbs} />}
        meta={
          orynxOnly
            ? undefined
            : sprint === null
              ? withoutSprint
                ? (choice.projectKey ?? undefined)
                : undefined
              : (sprintMeta(sprint, now) ?? undefined)
        }
        actions={
          <>
            {/* When the tools last synced, as the button that opens Sync activity, then Sync (spec 039, Q2). */}
            <SyncStatus />
            {orynxShown && !noSprint ? <NewTicketButton inPageBar compact={!wide} /> : null}
            {noSprint ? null : (
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
                    <Icon icon={KanbanIcon} aria-hidden />
                    Board
                  </SegmentedControlItem>
                  <SegmentedControlItem value="list">
                    <Icon icon={LeftToRightListBulletIcon} aria-hidden />
                    List
                  </SegmentedControlItem>
                </SegmentedControl>
              </>
            )}
          </>
        }
      />
      {/*
        Without Jira, the toolbar and the board are another page's: new elements in place of the sprint's, so the
        sprint's filters and pickers never slide away as the answer comes (spec 037, AC-36).
      */}
      <Fragment key={jiraOff ? 'without-jira' : 'with-jira'}>
        <TicketsToolbar
          filters={filters}
          onFiltersChange={changeFilters}
          onClear={clearFilters}
          options={options}
          count={loading ? undefined : shown.length}
          assigneeRef={assignee}
          {...(orynxOnly ? {} : { pickers: <SprintPickers choice={choice} sprint={sprint} loading={loading} /> })}
          pickersOnly={noSprint}
          sources={!jiraOff}
          {...(wide ? {} : { search: searchField })}
        />
        <PageBody width={noSprint ? 'wide' : 'full'}>
          <h1 className="sr-only">{shownName === null ? 'Tickets' : pageHeading(shownName)}</h1>
          {line === null && !truncated && kept === null ? null : (
            <div className="flex flex-col gap-1">
              {line === null ? null : <Note message={line.message} action={line.action} />}
              {truncated ? <Note message={tooManyLine(shownName)} action={null} /> : null}
              {kept === null ? null : <Note message={keptFileLine(kept)} action={null} />}
            </div>
          )}
          {body}
          <ShipSelected
            onCleared={() => {
              assignee.current?.focus();
            }}
          />
          <NewTicketDialog />
        </PageBody>
      </Fragment>
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

/**
 * Q8c: Jira answered, and no active sprint holds a ticket of yours, or the picked project has no open sprint
 * (spec 020, AC-28). A sync that failed before Jira ever answered can't say, so its line above stands alone.
 */
function NoSprint({ jira, choice }: { jira: InboxToolState; choice: TicketsChoice }) {
  const answered = jira.state === 'synced' || (jira.state === 'failed' && jira.lastSyncedAt !== null);
  if (!answered) return null;
  return choice.projectKey === null ? (
    <EmptyState title={noSprintText.title}>
      <span>{noSprintText.line}</span>
    </EmptyState>
  ) : (
    <EmptyState title={noOpenSprintsText(choice.projectKey)} />
  );
}

/** Q8e: the local server didn't answer. The sidebar and page bar keep working. */
function Unreachable({ pending, onRetry }: { pending: boolean; onRetry: () => void }) {
  return (
    <>
      <PageBar breadcrumb={<PageBreadcrumb crumbs={[ticketsCrumb]} />} />
      <PageBody>
        <h1 className="sr-only">Tickets</h1>
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
