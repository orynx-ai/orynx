import type { Meta, StoryObj } from '@storybook/react-vite';
import { AgentChip } from './agent-chip.tsx';
import { Board, BoardColumn } from './board.tsx';
import { EmptyState } from './empty-state.tsx';
import { WorkItemCard, WorkItemCardSkeleton, WorkItemTitle } from './work-item-card.tsx';

const me = { initials: 'RD', label: 'Assigned to you' };

/** The Tickets board: four columns by status, scrolling sideways inside its own box when the window is narrow. */
const meta = {
  title: 'Components/Board',
  component: Board,
  args: { 'aria-label': 'Board' },
} satisfies Meta<typeof Board>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Board {...args}>
      <BoardColumn status="todo" title="To do" count={1} aria-label="To do, 1 ticket">
        <WorkItemCard
          itemKey="PROJ-1377"
          type="Bug"
          bug
          assignee={me}
          priority={{ level: 'high', label: 'High' }}
          due={{ label: 'Mon', soon: true }}
          title={<WorkItemTitle href="#">Search returns archived sites for guest users</WorkItemTitle>}
        />
      </BoardColumn>
      <BoardColumn status="in_progress" title="In progress" count={1} aria-label="In progress, 1 ticket">
        <WorkItemCard
          itemKey="PROJ-1423"
          type="Story"
          assignee={me}
          priority={{ level: 'high', label: 'High' }}
          due={{ label: 'Fri', soon: true }}
          title={<WorkItemTitle href="#">Add bulk archive to the content list</WorkItemTitle>}
          action={<AgentChip state="needs_you" href="#" />}
        />
      </BoardColumn>
      <BoardColumn status="in_review" title="In review" count={0} aria-label="In review, 0 tickets">
        <EmptyState title="Nothing in review">
          <span>Tickets move here when you open a pull request.</span>
        </EmptyState>
      </BoardColumn>
      <BoardColumn status="done" title="Done" count={1} aria-label="Done, 1 ticket">
        <WorkItemCard
          itemKey="PROJ-1340"
          type="Story"
          assignee={me}
          priority={{ level: 'medium', label: 'Medium' }}
          due={{ label: '14 Oct' }}
          title={<WorkItemTitle href="#">Lazy-load the people directory</WorkItemTitle>}
        />
      </BoardColumn>
    </Board>
  ),
};

/** Before the first sync: names and icons, no counts, and loading cards the size of real ones. */
export const Loading: Story = {
  render: (args) => (
    <Board {...args}>
      {(
        [
          ['todo', 'To do'],
          ['in_progress', 'In progress'],
          ['in_review', 'In review'],
          ['done', 'Done'],
        ] as const
      ).map(([status, title]) => (
        <BoardColumn key={status} status={status} title={title} busy>
          <WorkItemCardSkeleton />
          <WorkItemCardSkeleton />
          <WorkItemCardSkeleton />
        </BoardColumn>
      ))}
    </Board>
  ),
};
