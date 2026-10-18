import type { Meta, StoryObj } from '@storybook/react-vite';
import { SidebarLeftIcon } from '@hugeicons/core-free-icons';
import { Icon } from './icon.tsx';
import { Tooltip } from './tooltip.tsx';

const meta = {
  title: 'Components/Tooltip',
  component: Tooltip,
  // Open from the start, so the story shows it; Escape closes it, and resting on the control opens it again.
  args: { label: 'Collapse sidebar', defaultOpen: true, children: <span /> },
  decorators: [
    (Story) => (
      <div className="flex min-h-40 items-center justify-center">
        <Story />
      </div>
    ),
  ],
  render: (args) => (
    <Tooltip {...args}>
      <button
        type="button"
        aria-label="Collapse sidebar"
        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-sm hover:bg-subtle"
      >
        <Icon icon={SidebarLeftIcon} aria-hidden />
      </button>
    </Tooltip>
  ),
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Above its control, as most tooltips open. */
export const Top: Story = {};

/** Beside a rail icon, where above would cover the icon over it. */
export const Right: Story = { args: { label: 'Tickets', side: 'right' } };

/** A longer name wraps inside 320 px rather than running off the window. */
export const LongName: Story = {
  args: { label: 'Rakesh Dhariwal · Claude not connected · runs locally', side: 'bottom' },
};
