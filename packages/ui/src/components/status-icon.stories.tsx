import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusIcon } from './status-icon.tsx';

const meta = {
  title: 'Components/StatusIcon',
  component: StatusIcon,
  args: { status: 'todo', label: 'To do' },
} satisfies Meta<typeof StatusIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ToDo: Story = {};
export const InProgress: Story = { args: { status: 'in_progress', label: 'In progress' } };
export const InReview: Story = { args: { status: 'in_review', label: 'In review' } };
export const Done: Story = { args: { status: 'done', label: 'Done' } };
/** As the board's column heads use them: the icon beside the column's name. */
export const ColumnHeads: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      {(
        [
          ['todo', 'To do'],
          ['in_progress', 'In progress'],
          ['in_review', 'In review'],
          ['done', 'Done'],
        ] as const
      ).map(([status, name]) => (
        <h2 key={status} className="m-0 flex items-center gap-2 text-body font-medium">
          <StatusIcon status={status} />
          {name}
        </h2>
      ))}
    </div>
  ),
};
