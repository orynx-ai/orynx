import type { Meta, StoryObj } from '@storybook/react-vite';
import { Alert02Icon, CheckmarkCircle02Icon, GitPullRequestIcon } from '@hugeicons/core-free-icons';
import { Button } from './button.tsx';
import { NotificationItem } from './notification-item.tsx';

const meta = {
  title: 'Components/NotificationItem',
  component: NotificationItem,
  args: {
    icon: CheckmarkCircle02Icon,
    tone: 'success',
    title: 'Session finished, ready for a pull request',
    detail: 'PROJ-1398 · Read receipts on analytics',
    time: '40 min ago',
    unread: true,
    onOpen: () => undefined,
  },
  decorators: [
    (Story) => (
      <ul className="max-w-sm rounded-md border border-border bg-raised">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof NotificationItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unread: Story = {};
export const Read: Story = { args: { unread: false } };
export const WaitingWithActions: Story = {
  args: {
    icon: Alert02Icon,
    tone: 'warning',
    title: 'Claude wants to run a command',
    detail: 'PROJ-1423 · Add bulk archive · npm test -- content-list',
    time: '2 min ago',
    actions: (
      <>
        <Button size="sm" variant="secondary">
          Allow once
        </Button>
        <Button size="sm" variant="ghost">
          Review
        </Button>
      </>
    ),
  },
};
export const Failing: Story = {
  args: {
    icon: Alert02Icon,
    tone: 'danger',
    title: 'Checks failed on your pull request',
    detail: 'web-app 2836 · Fix the export',
  },
};
export const Neutral: Story = {
  args: {
    icon: GitPullRequestIcon,
    tone: 'neutral',
    title: 'Arjun M. requested your review',
    detail: 'api 977 · Rate-limit the export endpoint',
    time: '1 h ago',
  },
};
export const LongText: Story = {
  args: {
    title: 'Session finished, ready for a pull request on a ticket whose title runs very long indeed',
    detail:
      'PROJ-1398 · Read receipts on analytics, with a title long enough to wrap onto a second line · 4 files changed',
  },
};
