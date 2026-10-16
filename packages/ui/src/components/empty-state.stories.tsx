import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button.tsx';
import { EmptyState } from './empty-state.tsx';

const meta = {
  title: 'Components/EmptyState',
  component: EmptyState,
  args: { title: 'Nothing in review', children: <span>Tickets move here when you open a pull request.</span> },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithFilters: Story = {
  args: {
    title: 'No tickets match these filters',
    children: <span>Try fewer filters.</span>,
    action: (
      <Button size="sm" variant="secondary">
        Clear filters
      </Button>
    ),
  },
};
