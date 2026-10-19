import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent, type RefObject } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { defaultPreferences, type ComposerChip, type Inbox, type InboxRules } from '@devhub/contracts';
import { ArrowRight01Icon, PlusSignIcon, Tick02Icon } from '@hugeicons/core-free-icons';
import {
  AttentionActions,
  AttentionList,
  AttentionRow,
  AttentionRowSkeleton,
  AttentionTitle,
  AttentionTitleButton,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Pagination,
  Panel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { countKey, homeTabLabels, homeTabs, itemsInTab, tabTools, type HomeTab } from '../inbox-tabs.ts';
import { emptyText, reasonPill, rowAction, subLine, tabCounts, toolLine, type ToolLine } from '../inbox-words.ts';
import { defaultView, filterMenus, searchFor, showView, searchForTab, viewOf, type HomeView } from '../inbox-view.ts';
import { useInbox, useInboxRules, type HomeItem } from '../queries.ts';
import { useNow } from '../use-now.ts';
import { InboxToolbar } from './inbox-toolbar.tsx';
import { OrderMenu } from './order-menu.tsx';
import { useTicketDialogStore } from '../../tickets/ticket-dialog-store.ts';
import { holds } from '../composer-rules.ts';
import { composerWords, refusedLine } from '../composer-words.ts';
import { useComposerStore } from '../store.ts';

const panelTitle = 'Needs your attention';

/**
 * Home's "Needs your attention" panel (spec 007): the tabs All, Jira and Pull requests with their counts, and
 * one row per ticket or pull request, newest wait first unless the order menu says otherwise, 16 a page. The
 * tab, search, filters, order and page live in the address, so a reload keeps them.
 */
export function AttentionPanel() {
  const inbox = useInbox();
  const rules = useInboxRules().data;
  const search = useSearch({ from: '/' });
  const navigate = useNavigate();
  const now = useNow();
  const view = viewOf(search);
  const { tab } = view;
  const { data } = inbox;

  if (data === undefined && inbox.isError) {
    return (
      <Panel title={panelTitle}>
        <EmptyState
          title="Couldn't load the list"
          action={
            <Button size="sm" pending={inbox.isFetching} onClick={() => void inbox.refetch()}>
              Try again
            </Button>
          }
        >
          <span>Check that Orynx is still running, then try again.</span>
        </EmptyState>
      </Panel>
    );
  }

  if (data?.tools.jira.state === 'not_connected' && data.tools.github.state === 'not_connected') {
    return (
      <Panel title={panelTitle}>
        <EmptyState
          title="Nothing needs you yet"
          action={
            <Button asChild size="sm">
              <Link to="/settings/$tab" params={{ tab: 'connections' }}>
                Connect your tools
              </Link>
            </Button>
          }
        >
          <span>Connect Jira, GitHub or Slack and the work that needs you shows up here.</span>
        </EmptyState>
      </Panel>
    );
  }

  const counts = data === undefined ? undefined : tabCounts(data.items);

  return (
    <Panel
      title={panelTitle}
      actions={
        <OrderMenu
          order={view.order}
          onOrderChange={(order) => {
            void navigate({ to: '/', search: searchFor({ ...view, order, page: 1 }), resetScroll: false });
          }}
        />
      }
    >
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const picked = homeTabs.find((each) => each === value) ?? 'all';
          // The panel sits low on Home, so picking a tab keeps the page where it is.
          void navigate({ to: '/', search: searchForTab(search, picked), resetScroll: false });
        }}
      >
        <TabsList aria-label="Filter by source">
          {homeTabs.map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              // A tab still waiting for its rows keeps a blank count's room (AC-20, Q11d).
              count={
                data === undefined || counts === undefined || loading(value, data) ? null : counts[countKey(value)]
              }
            >
              {homeTabLabels[value]}
            </TabsTrigger>
          ))}
        </TabsList>
        {homeTabs.map((value) => (
          // Not a stop of its own: Tab goes from the selected tab straight to its toolbar and rows (AC-33, AC-45).
          <TabsContent key={value} value={value} tabIndex={-1}>
            <TabView
              view={{ ...view, tab: value }}
              inbox={data}
              rules={rules ?? defaultPreferences.inboxRules}
              now={now}
              onViewChange={(next, { replace = false } = {}) => {
                void navigate({ to: '/', search: searchFor(next), replace, resetScroll: false });
              }}
            />
          </TabsContent>
        ))}
      </Tabs>
    </Panel>
  );
}

/**
 * One tab's panel: the toolbar while the tab has a tool connected, then its rows, or its loading rows. A
 * search or a tick goes back to the first page; typing replaces the address instead of adding to Back.
 */
function TabView({
  view,
  inbox,
  rules,
  now,
  onViewChange,
}: {
  view: HomeView;
  inbox: (Inbox & { items: HomeItem[] }) | undefined;
  rules: InboxRules;
  now: Date;
  onViewChange: (view: HomeView, how?: { replace?: boolean }) => void;
}) {
  const { tab } = view;
  const searchRef = useRef<HTMLInputElement | null>(null);
  const focusSearch = useRef(false);

  // After Clear search and filters, focus goes back to the search box once the address is clear (AC-38).
  useEffect(() => {
    if (!focusSearch.current || view.query !== '') return;
    focusSearch.current = false;
    searchRef.current?.focus();
  });

  const connected = inbox === undefined || tabTools[tab].some((tool) => inbox.tools[tool].state !== 'not_connected');
  return (
    <>
      {connected ? (
        <InboxToolbar
          tab={tab}
          query={view.query}
          menus={filterMenus(inbox?.items ?? [], tab, view.filters)}
          searchRef={searchRef}
          onQueryChange={(query) => {
            onViewChange({ ...view, query, page: 1 }, { replace: true });
          }}
          onFilterChange={(key, ticked) => {
            onViewChange({ ...view, filters: { ...view.filters, [key]: ticked }, page: 1 });
          }}
        />
      ) : null}
      {inbox === undefined || loading(tab, inbox) ? (
        <LoadingRows />
      ) : (
        <TabBody
          view={view}
          inbox={inbox}
          rules={rules}
          now={now}
          onClear={() => {
            focusSearch.current = true;
            onViewChange({ ...view, query: '', filters: defaultView.filters, page: 1 });
          }}
        />
      )}
    </>
  );
}

/** A tab waits for its rows while every connected tool it reads is on its first sync (AC-20). */
function loading(tab: HomeTab, inbox: Inbox): boolean {
  const states = tabTools[tab].map((tool) => inbox.tools[tool].state).filter((state) => state !== 'not_connected');
  return states.length > 0 && states.every((state) => state === 'syncing') && itemsInTab(inbox.items, tab).length === 0;
}

/** Rows the same size as real ones, so nothing moves when they arrive. */
function LoadingRows() {
  return (
    <AttentionList aria-busy="true">
      {homeLoadingRows.map((key) => (
        <AttentionRowSkeleton key={key} />
      ))}
    </AttentionList>
  );
}

const homeLoadingRows = ['first', 'second', 'third', 'fourth', 'fifth'];

function TabBody({
  view,
  inbox,
  rules,
  now,
  onClear,
}: {
  view: HomeView;
  inbox: Inbox & { items: HomeItem[] };
  rules: InboxRules;
  now: Date;
  onClear: () => void;
}) {
  const { tab } = view;
  const shown = showView(inbox.items, view);
  const { rows } = shown;
  const anyRows = itemsInTab(inbox.items, tab).length > 0;
  const lines = tabTools[tab].flatMap((tool) => {
    const state = inbox.tools[tool];
    // All says nothing of a tool that isn't connected, so someone who doesn't use it isn't nagged (Q5a).
    if (tab === 'all' && state.state === 'not_connected') return [];
    const line = toolLine(tool, state, now);
    return line === null ? [] : [{ tool, line }];
  });
  const connected = tabTools[tab].some((tool) => inbox.tools[tool].state !== 'not_connected');
  const keepFocus = useFocusAfterSync(rows);
  const firstRowAfterPaging = useFirstRowAfterPaging(shown.page, keepFocus.ref);
  // What a row's + did, for screen readers (spec 022, AC-28).
  const [said, setSaid] = useState('');

  return (
    <>
      <div {...keepFocus}>
        {lines.length > 0 ? (
          <div className="flex flex-col gap-1 px-4 py-3">
            {lines.map(({ tool, line }) => (
              <ToolNote key={tool} line={line} />
            ))}
          </div>
        ) : null}
        {rows.length > 0 ? (
          <AttentionList>
            {rows.map((item) => (
              <Row key={item.id} item={item} now={now} onSaid={setSaid} />
            ))}
          </AttentionList>
        ) : anyRows ? (
          <NoMatches onClear={onClear} />
        ) : connected ? (
          <NothingHere tab={tab} rules={rules} />
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {said}
      </p>
      {/* Outside the rows' box, so its list is never taken for theirs. */}
      {shown.pageCount > 1 ? (
        <div className="border-t border-border px-4 py-3">
          <Pagination
            page={shown.page}
            pageCount={shown.pageCount}
            pageLink={(page, children) => (
              <Link
                to="/"
                search={searchFor({ ...view, page })}
                resetScroll={false}
                activeOptions={{ exact: true, includeSearch: true }}
                onClick={firstRowAfterPaging(page)}
              >
                {children}
              </Link>
            )}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * After a page is picked in the pager, the list's top scrolls into view under the page bar and focus moves to
 * its first row's title (Q10g). Paging any other way, Back included, leaves focus alone.
 */
function useFirstRowAfterPaging(
  page: number,
  box: RefObject<HTMLDivElement | null>,
): (target: number) => (event: MouseEvent) => void {
  // The page the pager asked for, until the next page shows, whichever it is.
  const asked = useRef<number | null>(null);
  useEffect(() => {
    const target = asked.current;
    asked.current = null;
    if (target !== page) return;
    const list = box.current?.querySelector('ul');
    list?.querySelector<HTMLElement>(rowTitleSelector)?.focus({ preventScroll: true });
    list?.scrollIntoView({ block: 'start' });
  }, [page, box]);
  return (target) => (event) => {
    // The page already shown, or a click that opens a new tab, changes nothing here.
    if (target === page || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    asked.current = target;
  };
}

/** The tab has rows, but the search and filters let none through (AC-38, Q10e). */
function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      title="No matches"
      action={
        <Button size="sm" onClick={onClear}>
          Clear search and filters
        </Button>
      }
    >
      <span>Nothing in this tab matches your search and filters.</span>
    </EmptyState>
  );
}

/**
 * When a sync takes away the row that has focus, focus moves to the next row's title, to the row before it
 * when it was the last, to the first row when the page shown changed under it, or to the selected tab when no
 * row is left (AC-18). Rows that stay keep their elements, so focus on them never moves (AC-16).
 */
function useFocusAfterSync(rows: readonly HomeItem[]) {
  const box = useRef<HTMLDivElement>(null);
  // The ids on screen, in order, and the one whose row holds focus.
  const shown = useRef<string[]>([]);
  const focused = useRef<string | null>(null);

  useLayoutEffect(() => {
    const before = shown.current;
    const after = rows.map((row) => row.id);
    shown.current = after;
    const gone = focused.current;
    if (gone === null || after.includes(gone)) return;
    focused.current = null;
    // The row took focus with it only if nothing else has it now.
    if (document.activeElement !== null && document.activeElement !== document.body) return;
    const at = before.indexOf(gone);
    const next = [...before.slice(at + 1), ...before.slice(0, at).reverse()].find((id) => after.includes(id));
    // With none of its neighbours left (the list fell back a page), the first row shown takes focus.
    const target =
      next !== undefined
        ? rowTitle(box.current, after.indexOf(next))
        : after.length > 0
          ? rowTitle(box.current, 0)
          : selectedTab(box.current);
    target?.focus();
  }, [rows]);

  return {
    ref: box,
    onFocus: (event: FocusEvent) => {
      const row = event.target.closest('li');
      const list = box.current?.querySelector('ul');
      focused.current =
        row === null || list === null || list === undefined || row.parentElement !== list
          ? null
          : (shown.current[Array.prototype.indexOf.call(list.children, row)] ?? null);
    },
    onBlur: (event: FocusEvent) => {
      const left = event.target;
      // Focus leaving for somewhere else forgets the row; a row taken away by a sync is no longer on the page.
      queueMicrotask(() => {
        if (left.isConnected && !box.current?.contains(document.activeElement)) focused.current = null;
      });
    },
  };
}

/** A row's title: a link, or a button for a Jira ticket's (spec 022). */
const rowTitleSelector = '[data-slot="attention-title"]';

function rowTitle(box: HTMLElement | null, index: number): HTMLElement | null {
  return box?.querySelector('ul')?.children[index]?.querySelector<HTMLElement>(rowTitleSelector) ?? null;
}

/** Radix names the tab panel after its tab. */
function selectedTab(box: HTMLElement | null): HTMLElement | null {
  const tabId = box?.closest('[role="tabpanel"]')?.getAttribute('aria-labelledby');
  return tabId === null || tabId === undefined ? null : document.getElementById(tabId);
}

/** One quiet line for a tool that isn't connected or whose last sync failed, above its rows (Q5). */
function ToolNote({ line }: { line: ToolLine }) {
  return (
    <p className="m-0 text-small text-muted-foreground">
      {line.message}
      {line.action === null ? null : (
        <>
          {' '}
          <Link to="/settings/$tab" params={{ tab: line.action.tab }} className="text-info underline">
            {line.action.text}
          </Link>
          .
        </>
      )}
    </p>
  );
}

/** A tab with no rows: what shows up here, or that its rules are off (Q8b). */
function NothingHere({ tab, rules }: { tab: HomeTab; rules: InboxRules }) {
  const text = emptyText(countKey(tab), rules);
  return (
    <EmptyState title={text.title}>
      {text.rulesOff ? (
        <Link to="/settings/$tab" params={{ tab: 'inbox-rules' }} className="text-info underline">
          {text.line}
        </Link>
      ) : (
        <span>{text.line}</span>
      )}
    </EmptyState>
  );
}

function Row({ item, now, onSaid }: { item: HomeItem; now: Date; onSaid: (said: string) => void }) {
  const pill = reasonPill(item, now);
  return (
    <AttentionRow
      // Orynx's own mark leads a session on neither a ticket nor a pull request (spec 015, Q15b).
      source={item.source ?? 'orynx'}
      title={<RowTitle item={item} />}
      sub={subLine(item)}
      reason={
        <>
          <span aria-hidden>{pill.text}</span>
          <span className="sr-only">{pill.spoken}</span>
        </>
      }
      reasonTone={pill.tone}
      action={<RowActionButton item={item} onSaid={onSaid} />}
    />
  );
}

/**
 * Spec 022, D: a row's one action. A ticket or a pull request has +, which adds its chip to the composer above and
 * takes it out again, saying so to a screen reader; a session has Open session, which stays inside Orynx.
 */
function RowActionButton({ item, onSaid }: { item: HomeItem; onSaid: (said: string) => void }) {
  const action = rowAction(item);
  if (action.kind === 'none') return <AttentionActions />;
  if (action.kind === 'session') {
    return (
      <AttentionActions>
        <IconButton asChild variant="ghost" size="sm" label={action.label} aria-label={action.name}>
          <Link to="/sessions/$sessionId" params={{ sessionId: action.sessionId }}>
            <Icon icon={ArrowRight01Icon} aria-hidden />
          </Link>
        </IconButton>
      </AttentionActions>
    );
  }
  return (
    <AttentionActions>
      <AddToComposer chip={action.chip} label={action.label} onSaid={onSaid} />
    </AttentionActions>
  );
}

function AddToComposer({ chip, label, onSaid }: { chip: ComposerChip; label: string; onSaid: (said: string) => void }) {
  const held = useComposerStore((state) => holds(state.chips, chip));
  const addChip = useComposerStore((state) => state.addChip);
  const dropChip = useComposerStore((state) => state.dropChip);
  const words = composerWords.row;
  return (
    <IconButton
      variant="ghost"
      size="sm"
      label={held ? words.remove : words.add}
      aria-label={held ? words.removeName(label) : words.addName(label)}
      onClick={() => {
        if (held) {
          dropChip(chip);
          onSaid(words.removed(label));
          return;
        }
        const refusal = addChip(chip);
        // A kind that's full says why, and the button stays + (AC-31).
        onSaid(refusal === null ? words.added(label) : refusedLine(refusal));
      }}
    >
      <Icon icon={held ? Tick02Icon : PlusSignIcon} aria-hidden />
    </IconButton>
  );
}

/**
 * A row's title (spec 022): a Jira ticket's opens the ticket dialog; a pull request's opens it on GitHub, with no
 * arrow now that it's the row's only way out (AC-33); a session's opens it in Orynx.
 */
function RowTitle({ item }: { item: HomeItem }) {
  const platform = usePlatform();
  const show = useTicketDialogStore((state) => state.show);
  const { target, subject } = item;
  if (target.kind === 'session') {
    return (
      <AttentionTitle asChild title={item.title}>
        <Link to="/sessions/$sessionId" params={{ sessionId: target.sessionId }}>
          {item.title}
        </Link>
      </AttentionTitle>
    );
  }
  if (subject.kind === 'issue') {
    return (
      <AttentionTitleButton
        title={item.title}
        onClick={() => {
          show({ key: subject.key, title: item.title, type: null, url: target.url });
        }}
      >
        {item.title}
      </AttentionTitleButton>
    );
  }
  return (
    <AttentionTitle
      href={target.url}
      rel="noreferrer"
      title={item.title}
      onClick={(event) => {
        event.preventDefault();
        platform.openExternal(target.url);
      }}
    >
      {item.title}
    </AttentionTitle>
  );
}
