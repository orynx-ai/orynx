import type { Meta, StoryObj } from '@storybook/react-vite';
import { AgentChip } from './agent-chip.tsx';
import { WorkItemBuild, WorkItemCard, WorkItemTitle } from './work-item-card.tsx';

const meta = {
  title: 'Components/WorkItemCard',
  component: WorkItemCard,
  args: {
    itemKey: 'PROJ-1423',
    type: 'Story',
    assignee: { initials: 'RD', label: 'Assigned to you' },
    priority: { level: 'high', label: 'High' },
    due: { label: 'Fri', soon: true },
    title: <WorkItemTitle href="#session">Add bulk archive to the content list</WorkItemTitle>,
    action: <AgentChip state="needs_you" href="#session" />,
  },
  decorators: [
    (Story) => (
      // A board column: cards sit on the sidebar colour.
      <div className="w-70 max-w-full rounded-md bg-sidebar p-1.5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WorkItemCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Claude is waiting on you for this ticket. */
export const NeedsYou: Story = {};
export const Working: Story = {
  args: {
    itemKey: 'PROJ-1398',
    priority: { level: 'medium', label: 'Medium' },
    due: { label: 'Oct 30' },
    title: <WorkItemTitle href="#session">Read receipts on analytics</WorkItemTitle>,
    action: <AgentChip state="working" href="#session" />,
  },
};
/** No session yet: the quiet "Build with Claude" button. */
export const BugToBuild: Story = {
  args: {
    itemKey: 'PROJ-1377',
    type: 'Bug',
    bug: true,
    priority: { level: 'medium', label: 'Medium' },
    due: { label: 'Oct 28' },
    title: <WorkItemTitle href="#ticket">Search returns archived sites for guest users</WorkItemTitle>,
    action: <WorkItemBuild itemKey="PROJ-1377" />,
  },
};
/** A title longer than two lines is cut off with an ellipsis. */
export const LongTitle: Story = {
  args: {
    title: (
      <WorkItemTitle href="#session">
        Add bulk archive to the content list, with a confirmation step, partial failure reporting and an undo for ten
        seconds after the archive finishes
      </WorkItemTitle>
    ),
  },
};
/** Unassigned, low priority, no due date. */
export const Sparse: Story = {
  args: {
    assignee: undefined,
    due: undefined,
    priority: { level: 'low', label: 'Low' },
    action: <WorkItemBuild itemKey="PROJ-1423" />,
  },
};
