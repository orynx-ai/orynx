import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoreHorizontalIcon } from '@hugeicons/core-free-icons';
import { Icon } from './icon.tsx';
import { IconButton } from './icon-button.tsx';
import { SessionItem, SessionItemSkeleton } from './session-item.tsx';

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
export const PrMerged: Story = {
  args: { title: 'Add read receipts', source: 'PROJ-1385', state: 'pr_merged' },
};
export const PrClosed: Story = {
  args: { title: 'Swap the date picker', source: 'PROJ-1390', state: 'pr_closed' },
};
export const Stopped: Story = { args: { title: 'Try a faster search index', source: 'PROJ-1377', state: 'stopped' } };
export const Current: Story = { args: { 'aria-current': 'page' } };
export const NoSource: Story = { args: { title: 'Tidy the README', source: undefined, state: 'working' } };
export const LongTitle: Story = {
  args: { title: 'Show read receipts for every announcement in the analytics dashboard', state: 'working' },
};
export const LongSource: Story = {
  args: { title: 'Rename the billing exports', source: 'PLATFORM-123456', state: 'done' },
};

/** Two rows while the next page of sessions loads, under one that has loaded (spec 020). */
export const Loading: Story = {
  render: (args) => (
    <>
      <SessionItem {...args} />
      <SessionItemSkeleton />
      <SessionItemSkeleton />
    </>
  ),
};
/** Finished on your pull request's own branch (spec 031). */
export const DoneReadyToPush: Story = {
  args: { title: 'Fix the review comments', source: 'PR #2836', state: 'done', ready: 'push' },
};
/** An Ask, or a Build where Claude edited nothing: nothing to ship (spec 031). */
export const DoneNothingToShip: Story = {
  args: { title: 'How does the content list paginate?', source: undefined, state: 'done', ready: 'nothing' },
};

const more = (
  <IconButton variant="ghost" size="sm" label="More actions for Add bulk archive">
    <Icon icon={MoreHorizontalIcon} aria-hidden />
  </IconButton>
);

/** The sidebar's size (spec 039, Q4): a 14 px title, a 12 px line and a 20 px circle. */
export const Small: Story = { args: { size: 'sm' } };

/** Its ⋯ at the row's end (spec 039): shown on hover or focus, always under 768 px. Hover the row to see it. */
export const WithActions: Story = { args: { size: 'sm', actions: more } };

/** A long title is cut short before the ⋯, not under it. */
export const WithActionsLongTitle: Story = {
  args: {
    size: 'sm',
    actions: more,
    title: 'Show read receipts for every announcement in the analytics dashboard',
  },
};

export const SmallLoading: Story = {
  render: () => <SessionItemSkeleton size="sm" />,
};
