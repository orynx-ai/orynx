import { useNavigate } from '@tanstack/react-router';
import { useForm, useWatch } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  SearchPalette,
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
        label: text.label,
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

  return (
    <SearchPalette
      label={boxLabel}
      query={query}
      onQueryChange={(next) => {
        form.setValue('query', next);
      }}
      groups={groups}
      onPick={open}
      status={query.trim() === '' || index.data === undefined ? undefined : resultCount(found)}
    >
      <p className="px-2 py-1.5 text-small text-muted-foreground">
        Find a ticket by key or title, a pull request by number or repository, or a session.
      </p>
    </SearchPalette>
  );
}
