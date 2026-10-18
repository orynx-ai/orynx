import type { Meta, StoryObj } from '@storybook/react-vite';
import { SquareLock02Icon } from '@hugeicons/core-free-icons';
import { Button } from './button.tsx';
import { Callout, CalloutCode } from './callout.tsx';
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
    children: <CalloutCode>npm test -- content-list</CalloutCode>,
    // As session.html draws them: no answer looks like the expected one (spec 012, Q5).
    actions: (
      <>
        <Button size="sm">Allow once</Button>
        <Button size="sm">Always allow npm test</Button>
        <Button size="sm" variant="ghost">
          Deny
        </Button>
      </>
    ),
  },
};

/** A command that wraps and runs past 12 lines: it scrolls inside its box (spec 012, Q8a). */
export const LongCommand: Story = {
  args: {
    tone: 'warning',
    role: 'alert',
    title: 'Claude wants to run a command',
    children: (
      <CalloutCode>
        {[
          'pnpm --filter @devhub/app exec vitest run src/features/sessions/components/approval-callout.test.tsx --reporter=verbose --coverage.enabled=false',
          ...Array.from({ length: 20 }, (_, line) => `echo "line ${String(line + 2)}"`),
        ].join('\n')}
      </CalloutCode>
    ),
    actions: (
      <>
        <Button size="sm">Allow once</Button>
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

/** A notice the person may hide for good, as Settings' local-first note (spec 020). */
export const Closable: Story = {
  args: { ...Info.args, closeLabel: 'Hide this note', onClose: () => undefined },
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
