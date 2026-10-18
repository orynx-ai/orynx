import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button.tsx';
import { EmptyState } from './empty-state.tsx';
import { SearchPalette, type SearchPaletteGroup, type SearchPaletteProps } from './search-palette.tsx';
import { SearchResultSkeleton } from './search-result.tsx';
import { SessionStateIcon } from './session-item.tsx';
import { SourceMark } from './source-mark.tsx';

const label = 'Search tickets, pull requests and sessions';

const results: SearchPaletteGroup[] = [
  {
    id: 'tickets',
    label: 'Tickets · 2 of 23',
    items: [
      {
        id: 'ticket:PROJ-1423',
        label: 'PROJ-1423, Add bulk archive, In Progress',
        mark: <SourceMark source="jira" label="none" />,
        code: 'PROJ-1423',
        title: 'Add bulk archive',
        meta: 'In Progress',
      },
      {
        id: 'ticket:PROJ-1377',
        label: 'PROJ-1377, Search returns archived sites for guest users, To Do',
        mark: <SourceMark source="jira" label="none" />,
        code: 'PROJ-1377',
        title: 'Search returns archived sites for guest users',
        meta: 'To Do',
      },
    ],
  },
  {
    id: 'pull-requests',
    label: 'Pull requests',
    items: [
      {
        id: 'pull:acme/web-app/2841',
        label: 'web-app #2841, Lazy-load the people directory, Priya Shah',
        mark: <SourceMark source="github" label="none" />,
        code: 'web-app #2841',
        title: 'Lazy-load the people directory',
        meta: 'Priya Shah',
      },
    ],
  },
  {
    id: 'sessions',
    label: 'Sessions',
    items: [
      {
        id: 'session:1',
        label: 'Add bulk archive, PROJ-1423, Needs you',
        mark: <SessionStateIcon state="needs_you" />,
        code: 'PROJ-1423',
        title: 'Add bulk archive',
        meta: 'Needs you',
      },
    ],
  },
];

/** The palette with its own text, in a box drawn like the Dialog's. */
function Palette(props: Partial<SearchPaletteProps>) {
  const [query, setQuery] = useState(props.query ?? '');
  return (
    <div className="flex max-h-120 max-w-180 flex-col overflow-hidden rounded-lg border border-border bg-raised shadow-overlay">
      <SearchPalette
        label={label}
        groups={[]}
        onPick={() => undefined}
        {...props}
        query={query}
        onQueryChange={setQuery}
      />
    </div>
  );
}

const meta = {
  title: 'Components/SearchPalette',
  component: Palette,
} satisfies Meta<typeof Palette>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing typed yet: the hint line. */
export const Hint: Story = {
  args: {
    children: (
      <p className="px-2 py-1.5 text-small text-muted-foreground">
        Find a ticket by key or title, a pull request by number or repository, or a session.
      </p>
    ),
  },
};

/** Results in their groups, the first one active. ↓ and ↑ move it. */
export const Results: Story = { args: { query: 'archive', groups: results, status: '25 results' } };

/** Results, with a tool still on its first sync. */
export const Syncing: Story = {
  args: {
    query: 'web-app',
    groups: results.slice(1, 2),
    note: 'Jira is still syncing. Its tickets appear when it ends.',
  },
};

/** The list hasn't come back yet: three loading rows. */
export const Loading: Story = {
  args: {
    query: 'archive',
    busy: true,
    children: (
      <>
        <SearchResultSkeleton />
        <SearchResultSkeleton />
        <SearchResultSkeleton />
      </>
    ),
  },
};

/** Nothing matches. */
export const NoMatches: Story = {
  args: {
    query: 'PROJ-9999',
    children: (
      <EmptyState title="No matches">
        <span>Try a key like PROJ-1423 or a repo name.</span>
      </EmptyState>
    ),
  },
};

/** The local server didn't answer. */
export const Error: Story = {
  args: {
    query: 'archive',
    children: <EmptyState title="Couldn't load search" action={<Button size="sm">Try again</Button>} />,
  },
};
