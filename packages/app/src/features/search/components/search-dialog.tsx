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
        code: text.code,
        title: text.title,
        meta: text.meta ?? undefined,
      };
    }),
  }));

  /** Where Home and Tickets go (Q2c): a ticket's session, else Jira; a pull request on GitHub; a session in DevHub. */
  function open(id: string) {
    const hit = hits.get(id);
    if (hit === undefined) return;
    setOpen(false);
    const sessionId =
      hit.kind === 'session'
        ? hit.session.id
        : hit.kind === 'ticket' && hit.ticket.target.kind === 'session'
          ? hit.ticket.target.sessionId
          : null;
    if (sessionId !== null) {
      void navigate({ to: '/sessions/$sessionId', params: { sessionId } });
    } else if (hit.kind === 'ticket' && hit.ticket.target.kind === 'external') {
      platform.openExternal(hit.ticket.target.url);
    } else if (hit.kind === 'pull_request') {
      platform.openExternal(hit.pullRequest.url);
    }
  }

  const typed = query.trim() !== '';
  const data = index.data;

  /** What shows where the results would be, when there are none to show. */
  function body() {
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
    if (data !== undefined && nothingToSearch(data)) {
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
    if (data === undefined) {
      return (
        <>
          <SearchResultSkeleton />
          <SearchResultSkeleton />
          <SearchResultSkeleton />
        </>
      );
    }
    return (
      <EmptyState title="No matches">
        <span>Try a key like PROJ-1423 or a repo name.</span>
      </EmptyState>
    );
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
      status={!typed || data === undefined ? undefined : resultCount(found)}
      busy={typed && index.isPending}
      note={notes.length === 0 ? undefined : notes.join(' ')}
    >
      {body()}
    </SearchPalette>
  );
}
