import type { Meta, StoryObj } from '@storybook/react-vite';
import { SessionItem } from './session-item.tsx';

const meta = {
  title: 'Components/SessionItem',
  component: SessionItem,
  args: { href: '#', title: 'Add bulk archive', source: 'PROJ-1423', state: 'needs_you' },
  decorators: [
    (Story) => (
      <nav aria-label="Sessions" className="flex w-65 flex-col gap-0.5 bg-sidebar p-3">
        <Story />
      </nav>
    ),
  ],
} satisfies Meta<typeof SessionItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NeedsYou: Story = {};
export const Working: Story = { args: { title: 'Read receipts on analytics', source: 'PROJ-1398', state: 'working' } };
export const Done: Story = { args: { title: 'Fix timezone shift in event cards', source: 'PR #2836', state: 'done' } };
export const PrOpen: Story = { args: { title: 'Bulk archive for events', source: 'PROJ-1401', state: 'pr_open' } };
export const Stopped: Story = { args: { title: 'Try a faster search index', source: 'PROJ-1377', state: 'stopped' } };
export const Current: Story = { args: { 'aria-current': 'page' } };
export const NoSource: Story = { args: { title: 'Tidy the README', source: undefined, state: 'working' } };
export const LongTitle: Story = {
  args: { title: 'Show read receipts for every announcement in the analytics dashboard', state: 'working' },
};
