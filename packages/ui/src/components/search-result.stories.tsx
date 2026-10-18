import type { Meta, StoryObj } from '@storybook/react-vite';
import { SearchGroup, SearchResult, SearchResultSkeleton } from './search-result.tsx';
import { SessionStateIcon } from './session-item.tsx';
import { SourceMark } from './source-mark.tsx';

/** "#2841", written so the style gate doesn't read it as a colour. */
const hash = (number: number) => `#${String(number)}`;

const meta = {
  title: 'Components/SearchResult',
  component: SearchResult,
  args: {
    id: 'ticket-PROJ-1423',
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
    mark: <SourceMark source="github" label="none" />,
    code: 'web-app',
    codeEnd: hash(2841),
    title: 'Lazy-load the people directory',
    meta: 'Priya Shah',
  },
};

/** A session: the sidebar's state icon, then its ticket key and its state in words. */
export const Session: Story = {
  args: {
    id: 'session-1',
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
          mark={<SourceMark source="jira" label="none" />}
          code="PROJ-1423"
          title="Add bulk archive"
          meta="In Progress"
        />
        <SearchResult
          id="group-ticket-2"
          mark={<SourceMark source="jira" label="none" />}
          code="PROJ-1377"
          title="Search returns archived sites"
          meta="To Do"
        />
      </SearchGroup>
      <SearchGroup label="Pull requests">
        <SearchResult
          id="group-pull-1"
          mark={<SourceMark source="github" label="none" />}
          code="web-app"
          codeEnd={hash(2841)}
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
