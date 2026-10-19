import { Link, useNavigate } from '@tanstack/react-router';
import { useForm, useWatch } from 'react-hook-form';
import type { SearchIndex } from '@devhub/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  EmptyState,
  SearchPalette,
  SearchResultSkeleton,
  SessionStateIcon,
  SourceMark,
  type SearchPaletteGroup,
} from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { useSearchIndex } from '../queries.ts';
import { hitText, resultCount, searchResults, type SearchHit } from '../search-results.ts';
import { useTicketDialogStore } from '../../tickets/ticket-dialog-store.ts';
import { useSearchStore } from '../store.ts';

const boxLabel = 'Search tickets, pull requests and sessions';

/**
 * ⌘K search (spec 009): a dialog over any page, opened by ⌘K or Ctrl+K and the sidebar's Search. It opens
 * empty every time: the body unmounts when the dialog closes, and the text with it.
 */
export function SearchDialog() {
  const open = useSearchStore((state) => state.open);
  const setOpen = useSearchStore((state) => state.setOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <SearchBody />
      </DialogContent>
    </Dialog>
  );
}

function mark(hit: SearchHit) {
  switch (hit.kind) {
    case 'ticket':
      return <SourceMark source="jira" label="none" />;
    case 'pull_request':
      return <SourceMark source="github" label="none" />;
    case 'session':
      return <SessionStateIcon state={hit.session.state} />;
  }
}

/** Nothing is connected and there are no sessions, so there is nothing to find (AC-22). */
function nothingToSearch(index: SearchIndex): boolean {
  return (
    index.tools.jira.state === 'not_connected' &&
    index.tools.github.state === 'not_connected' &&
    index.sessions.length === 0
  );
}

/** A line for each tool still on its first sync, whose results come when it ends (AC-24, Q5e). */
function syncingLines(index: SearchIndex): string[] {
  const lines: string[] = [];
  if (index.tools.jira.state === 'syncing') lines.push('Jira is still syncing. Its tickets appear when it ends.');
  if (index.tools.github.state === 'syncing') {
    lines.push('GitHub is still syncing. Its pull requests appear when it ends.');
  }
  return lines;
}

const hint = 'Find a ticket by key or title, a pull request by number or repository, or a session.';

function SearchBody() {
  const form = useForm<{ query: string }>({ defaultValues: { query: '' } });
  const query = useWatch({ control: form.control, name: 'query' });
  const index = useSearchIndex();
  const setOpen = useSearchStore((state) => state.setOpen);
  const showTicket = useTicketDialogStore((state) => state.show);
  const platform = usePlatform();
  const navigate = useNavigate();

  const found = index.data === undefined ? [] : searchResults(index.data, query);
  const hits = new Map(found.flatMap((group) => group.hits.map((hit) => [hit.id, hit] as const)));
  const groups: SearchPaletteGroup[] = found.map((group) => ({
    id: group.kind,
    label: group.label,
    items: group.hits.map((hit) => {
      const text = hitText(hit);
      return {
        id: hit.id,
        mark: mark(hit),
        code: text.code === '' ? undefined : text.code,
        codeEnd: text.codeEnd ?? undefined,
        title: text.title,
        meta: text.meta ?? undefined,
      };
    }),
  }));

  /**
   * A ticket opens the ticket dialog, which has Open in Jira and Open session (spec 022, Q8); a pull request opens
   * on GitHub; a session in DevHub (Q2c).
   */
  function open(id: string) {
    const hit = hits.get(id);
    if (hit === undefined) return;
    setOpen(false);
    if (hit.kind === 'ticket') {
      const { key, title, target } = hit.ticket;
      showTicket({ key, title, type: null, url: target.kind === 'external' ? target.url : null });
    } else if (hit.kind === 'session') {
      void navigate({ to: '/sessions/$sessionId', params: { sessionId: hit.session.id } });
    } else {
      platform.openExternal(hit.pullRequest.url);
    }
  }

  const typed = query.trim() !== '';
  const data = index.data;

  /** What shows where the results would be, when there are none to show. */
  function body() {
    // Try again puts a query that never answered back to pending, so the loading rows below show it working.
    if (data === undefined && index.isError) {
      return (
        <EmptyState
          title="Couldn't load search"
          action={
            <Button
              size="sm"
              onClick={() => {
                void index.refetch();
              }}
            >
              Try again
            </Button>
          }
        />
      );
    }
    // The list is on its way: loading rows the size of a result, typed or not (AC-23).
    if (data === undefined) {
      return (
        <>
          <SearchResultSkeleton />
          <SearchResultSkeleton />
          <SearchResultSkeleton />
        </>
      );
    }
    if (nothingToSearch(data)) {
      return (
        <EmptyState
          title="Nothing to search yet"
          action={
            <Button size="sm" asChild>
              <Link
                to="/settings/$tab"
                params={{ tab: 'connections' }}
                onClick={() => {
                  setOpen(false);
                }}
              >
                Open Settings
              </Link>
            </Button>
          }
        >
          <span>Connect Jira or GitHub to search your tickets and pull requests.</span>
        </EmptyState>
      );
    }
    if (!typed) return <p className="px-2 py-1.5 text-small text-muted-foreground">{hint}</p>;
    return (
      <EmptyState title="No matches">
        <span>Try a key like PROJ-1423 or a repo name.</span>
      </EmptyState>
    );
  }

  /** What a screen reader hears once typing pauses (Q5g), and the states it would otherwise miss. */
  function spoken(): string | undefined {
    if (data === undefined) return index.isError ? "Couldn't load search" : undefined;
    if (nothingToSearch(data)) return 'Nothing to search yet';
    return typed ? resultCount(found) : undefined;
  }

  const notes = data === undefined || nothingToSearch(data) ? [] : syncingLines(data);
  return (
    <SearchPalette
      label={boxLabel}
      query={query}
      onQueryChange={(next) => {
        form.setValue('query', next);
      }}
      groups={groups}
      onPick={open}
      status={spoken()}
      busy={index.isPending}
      note={notes.length === 0 ? undefined : notes.join(' ')}
    >
      {body()}
    </SearchPalette>
  );
}
