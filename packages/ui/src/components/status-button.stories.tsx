import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusButton, StatusSign } from './status-button.tsx';

const meta = {
  title: 'Components/StatusButton',
  component: StatusButton,
  args: {
    state: 'connected',
    label: 'Connected · select to manage',
    'aria-label': 'Jira: Connected. Manage connection',
  },
} satisfies Meta<typeof StatusButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};

export const NeedsReconnecting: Story = {
  args: {
    state: 'needs_reconnecting',
    label: 'Needs reconnecting · select to fix',
    'aria-label': 'GitHub: Needs reconnecting. Manage connection',
  },
};

export const NotConnected: Story = {
  args: {
    state: 'not_connected',
    label: 'Not connected · select to connect',
    'aria-label': 'Slack: Not connected. Manage connection',
  },
};

/** The key under Settings › Connections' list: each look at 20 px, with its words. */
export const Key: Story = {
  render: () => (
    <ul aria-label="Status key" className="m-0 flex list-none flex-wrap gap-4 p-0 text-label text-muted-foreground">
      <li className="inline-flex items-center gap-1.5">
        <StatusSign state="connected" />
        Connected
      </li>
      <li className="inline-flex items-center gap-1.5">
        <StatusSign state="needs_reconnecting" />
        Needs reconnecting
      </li>
      <li className="inline-flex items-center gap-1.5">
        <StatusSign state="not_connected" />
        Not connected
      </li>
    </ul>
  ),
};
