import type { Meta, StoryObj } from '@storybook/react-vite';
import { SearchGroup, SearchResult, SearchResultSkeleton } from './search-result.tsx';
import { SessionStateIcon } from './session-item.tsx';
import { SourceMark } from './source-mark.tsx';

const meta = {
  title: 'Components/SearchResult',
  component: SearchResult,
  args: {
    id: 'ticket-PROJ-1423',
    'aria-label': 'PROJ-1423, Add bulk archive, In Progress',
    mark: <SourceMark source="jira" label="none" />,
    code: 'PROJ-1423',
    title: 'Add bulk archive',
    meta: 'In Progress',
  },
  decorators: [
    (Story) => (
      <div role="listbox" aria-label="Results" className="max-w-180 p-1.5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SearchResult>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A ticket: the Jira mark, its key in mono, its title and its status. */
export const Ticket: Story = {};

/** The result the arrow keys are on: `bg-subtle`. */
export const Active: Story = { args: { active: true } };

/** A pull request: the GitHub mark, the repository and number, and its author. */
export const PullRequest: Story = {
  args: {
    id: 'pull-request-2841',
    'aria-label': 'web-app #2841, Lazy-load the people directory, Priya Shah',
    mark: <SourceMark source="github" label="none" />,
    code: 'web-app #2841',
    title: 'Lazy-load the people directory',
    meta: 'Priya Shah',
  },
};

/** A session: the sidebar's state icon, then its ticket key and its state in words. */
export const Session: Story = {
  args: {
    id: 'session-1',
    'aria-label': 'Add bulk archive, PROJ-1423, Needs you',
    mark: <SessionStateIcon state="needs_you" />,
    code: 'PROJ-1423',
    title: 'Add bulk archive',
    meta: 'Needs you',
  },
};

/** A title longer than the row: cut off with an ellipsis, whole in the tooltip. */
export const LongTitle: Story = {
  args: {
    title: 'Search returns archived sites for guest users when the audience filter is set to everyone in the company',
  },
};

/** Groups with their labels, one saying how many more match. */
export const Groups: Story = {
  render: () => (
    <>
      <SearchGroup label="Tickets · 2 of 23">
        <SearchResult
          id="group-ticket-1"
          active
          aria-label="PROJ-1423, Add bulk archive, In Progress"
          mark={<SourceMark source="jira" label="none" />}
          code="PROJ-1423"
          title="Add bulk archive"
          meta="In Progress"
        />
        <SearchResult
          id="group-ticket-2"
          aria-label="PROJ-1377, Search returns archived sites, To Do"
          mark={<SourceMark source="jira" label="none" />}
          code="PROJ-1377"
          title="Search returns archived sites"
          meta="To Do"
        />
      </SearchGroup>
      <SearchGroup label="Pull requests">
        <SearchResult
          id="group-pull-1"
          aria-label="web-app #2841, Lazy-load the people directory, Priya Shah"
          mark={<SourceMark source="github" label="none" />}
          code="web-app #2841"
          title="Lazy-load the people directory"
          meta="Priya Shah"
        />
      </SearchGroup>
    </>
  ),
};

/** Loading: three rows the size of a result. */
export const Loading: Story = {
  decorators: [
    (Story) => (
      <div aria-busy="true" className="max-w-180 p-1.5">
        <Story />
      </div>
    ),
  ],
  render: () => (
    <>
      <SearchResultSkeleton />
      <SearchResultSkeleton />
      <SearchResultSkeleton />
    </>
  ),
};
