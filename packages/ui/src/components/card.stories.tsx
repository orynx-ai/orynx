import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from './card.tsx';
import { Pill } from './pill.tsx';
import { Skeleton } from './skeleton.tsx';

const line = 'Uses your company Claude login through the Claude Agent SDK. No separate API key.';

const meta = {
  title: 'Components/Card',
  component: Card,
  args: {
    title: 'Claude',
    look: 'selected',
    aside: <Pill tone="success">Active</Pill>,
    children: <p className="m-0 text-small text-muted-foreground">{line}</p>,
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Settings › Coding agent: the agent in use. */
export const Selected: Story = {};
export const Plain: Story = { args: { look: 'plain' } };
/** Settings › Coding agent: an agent still to come. */
export const Placeholder: Story = {
  args: {
    title: 'More agents',
    look: 'placeholder',
    aside: undefined,
    children: (
      <p className="m-0 text-small text-muted-foreground">
        Coming later. Each agent plugs in through one small adapter.
      </p>
    ),
  },
};
/** While its state loads: a skeleton the pill's size, so nothing moves when it comes. */
export const Loading: Story = { args: { aside: <Skeleton className="h-6 w-16" /> } };
export const LongText: Story = {
  args: {
    title: 'Claude Code on a computer with a very long name that has to wrap',
    children: (
      <p className="m-0 text-small text-muted-foreground">
        {line} {line}
      </p>
    ),
  },
};
