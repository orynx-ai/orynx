import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowUpRight01Icon, Refresh04Icon, SparklesIcon } from '@hugeicons/core-free-icons';
import { Icon } from './icon.tsx';
import { IconButton } from './icon-button.tsx';

const meta = {
  title: 'Components/IconButton',
  component: IconButton,
  args: { label: 'Refresh', children: <Icon icon={Refresh04Icon} aria-hidden /> },
  decorators: [
    (Story) => (
      <div className="flex min-h-32 items-center justify-center">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 40 px, secondary. Rest on it, or Tab to it, for its tooltip. */
export const Default: Story = {};

/** 32 px and ghost, as dense rows draw it; the name says which ticket, the tooltip stays short. */
export const SmallGhost: Story = {
  args: {
    label: 'Ship',
    'aria-label': 'Ship PROJ-1423',
    variant: 'ghost',
    size: 'sm',
    children: <Icon icon={SparklesIcon} aria-hidden />,
  },
};

/** While its action runs: a spinner in the icon's place, and presses are ignored. */
export const Pending: Story = { args: { ...SmallGhost.args, label: 'Ship', pending: true } };

/** A link that goes somewhere, drawn as an icon button. */
export const AsLink: Story = {
  args: {
    label: 'Open in Jira',
    'aria-label': 'Open PROJ-1423 in Jira',
    variant: 'ghost',
    size: 'sm',
    asChild: true,
    children: (
      <a href="#jira">
        <Icon icon={ArrowUpRight01Icon} aria-hidden />
      </a>
    ),
  },
};
