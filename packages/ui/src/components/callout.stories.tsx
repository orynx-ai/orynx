import type { Meta, StoryObj } from '@storybook/react-vite';
import { SquareLock02Icon } from '@hugeicons/core-free-icons';
import { Button } from './button.tsx';
import { Callout } from './callout.tsx';
import { Icon } from './icon.tsx';

const meta = { title: 'Components/Callout', component: Callout, args: { title: 'Notice' } } satisfies Meta<
  typeof Callout
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Approval: Story = {
  args: {
    tone: 'warning',
    role: 'alert',
    title: 'Claude wants to run a command',
    children: (
      <code className="rounded-sm border border-border bg-raised px-2 py-1.5 font-mono text-code text-foreground">
        npm test -- content-list
      </code>
    ),
    actions: (
      <>
        <Button size="sm" variant="primary">
          Allow once
        </Button>
        <Button size="sm">Always allow npm test</Button>
        <Button size="sm" variant="ghost">
          Deny
        </Button>
      </>
    ),
  },
};

export const Info: Story = {
  args: {
    tone: 'info',
    icon: <Icon icon={SquareLock02Icon} aria-hidden />,
    title: 'Everything stays on this computer',
    children: <span>Tokens live in your OS keychain. Orynx talks only to Jira, GitHub, Slack and Claude.</span>,
  },
};

/** A session that couldn't start, or stopped with an error (spec 011, Q9f). */
export const Danger: Story = {
  args: {
    tone: 'danger',
    title: "Claude couldn't start",
    children: (
      <span>Claude Code&apos;s login didn&apos;t work. Sign in with `claude` in a terminal, then start again.</span>
    ),
  },
};
