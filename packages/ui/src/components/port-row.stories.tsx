import type { Meta, StoryObj } from '@storybook/react-vite';
import { Copy01Icon, StopIcon, LinkSquare02Icon, RefreshIcon, TerminalIcon } from '@hugeicons/core-free-icons';
import { Icon } from './icon.tsx';
import { IconButton } from './icon-button.tsx';
import { PortList, PortRow, PortRowSkeleton } from './port-row.tsx';

const meta = {
  title: 'Components/PortRow',
  component: PortRow,
  decorators: [
    (Story) => (
      <PortList aria-label="Ports">
        <Story />
      </PortList>
    ),
  ],
  args: {
    address: 'localhost:3005',
    name: 'node',
    command: 'node ./node_modules/next/dist/bin/next dev --experimental-https --port 3005',
    meta: 'Claude · 4 min',
    actions: (
      <>
        <IconButton variant="ghost" size="sm" label="Open" aria-label="Open localhost:3005">
          <Icon icon={LinkSquare02Icon} />
        </IconButton>
        <IconButton variant="ghost" size="sm" label="Restart" aria-label="Restart localhost:3005">
          <Icon icon={RefreshIcon} />
        </IconButton>
        <IconButton variant="ghost" size="sm" label="Stop" aria-label="Stop localhost:3005">
          <Icon icon={StopIcon} />
        </IconButton>
      </>
    ),
  },
} satisfies Meta<typeof PortRow>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A web server Claude started: Open, Restart and Stop. */
export const WebServer: Story = {};
/** A database: Copy address instead of Open. */
export const Database: Story = {
  args: {
    address: 'localhost:5432',
    name: 'PostgreSQL',
    command: 'postgres -D ./data',
    meta: 'You · 2 h',
    actions: (
      <>
        <IconButton variant="ghost" size="sm" label="Copy" aria-label="Copy localhost:5432">
          <Icon icon={Copy01Icon} />
        </IconButton>
        <IconButton variant="ghost" size="sm" label="Stop" aria-label="Stop localhost:5432">
          <Icon icon={StopIcon} />
        </IconButton>
      </>
    ),
  },
};
/** Found in the worktree, started some other way: no Restart, but Run again in Terminal. */
export const Found: Story = {
  args: {
    meta: 'Found in the worktree · 12 min',
    actions: (
      <>
        <IconButton variant="ghost" size="sm" label="Open" aria-label="Open localhost:3005">
          <Icon icon={LinkSquare02Icon} />
        </IconButton>
        <IconButton variant="ghost" size="sm" label="Run again in Terminal">
          <Icon icon={TerminalIcon} />
        </IconButton>
        <IconButton variant="ghost" size="sm" label="Stop" aria-label="Stop localhost:3005">
          <Icon icon={StopIcon} />
        </IconButton>
      </>
    ),
  },
};
/** Still loading: the row's own height. */
export const Loading: Story = { render: () => <PortRowSkeleton /> };
/** A phone's width: the command is cut, the buttons stay. */
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className="max-w-80">
        <Story />
      </div>
    ),
  ],
};
