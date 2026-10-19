import type { Meta, StoryObj } from '@storybook/react-vite';
import { NotificationBell } from './notification-bell.tsx';

const meta = {
  title: 'Components/NotificationBell',
  component: NotificationBell,
  args: { unread: 4 },
  decorators: [
    (Story) => (
      <div className="bg-sidebar p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NotificationBell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unread: Story = {};
export const NoneUnread: Story = { args: { unread: 0 } };
export const OverNinetyNine: Story = { args: { unread: 140 } };
