import { SparklesIcon } from '@hugeicons/core-free-icons';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button.tsx';
import { FloatingBar, FloatingBarSeparator } from './floating-bar.tsx';
import { Icon } from './icon.tsx';

const meta = {
  title: 'Components/FloatingBar',
  component: FloatingBar,
  args: {
    'aria-label': 'Selected tickets',
    children: (
      <>
        <span role="status" className="text-small text-muted-foreground">
          2 selected
        </span>
        <Button variant="danger-ghost" size="sm">
          Unselect all
        </Button>
        <FloatingBarSeparator />
        <Button variant="ghost" size="sm">
          Ship all
          <Icon icon={SparklesIcon} aria-hidden />
        </Button>
      </>
    ),
  },
} satisfies Meta<typeof FloatingBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Tickets with two ticked: the count, Unselect all and Ship all. */
export const Selection: Story = {};
/** One ticked. */
export const One: Story = {
  args: {
    children: (
      <>
        <span role="status" className="text-small text-muted-foreground">
          1 selected
        </span>
        <Button variant="danger-ghost" size="sm">
          Unselect all
        </Button>
        <FloatingBarSeparator />
        <Button variant="ghost" size="sm">
          Ship all
          <Icon icon={SparklesIcon} aria-hidden />
        </Button>
      </>
    ),
  },
};
