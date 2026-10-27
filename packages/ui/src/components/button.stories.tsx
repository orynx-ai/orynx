import type { Meta, StoryObj } from '@storybook/react-vite';
import { GitPullRequestIcon } from '@hugeicons/core-free-icons';
import { Button } from './button.tsx';
import { Icon } from './icon.tsx';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { children: 'Create pull request' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: 'primary' } };
export const Secondary: Story = { args: { variant: 'secondary', children: 'Open in VS Code' } };
export const Ghost: Story = { args: { variant: 'ghost', children: 'Cancel' } };
/** A ghost toggle that's on, as Wrap lines is (spec 048). */
export const GhostPressed: Story = {
  args: { variant: 'ghost', size: 'sm', 'aria-pressed': true, children: 'Wrap lines' },
};
export const Danger: Story = { args: { variant: 'danger', children: 'Discard changes' } };
/** The quiet one `session.html` draws under the changes: ghost, danger text, a confirm step before it acts. */
export const DangerGhost: Story = { args: { variant: 'danger-ghost', size: 'sm', children: 'Discard changes' } };
export const Small: Story = { args: { variant: 'primary', size: 'sm', children: 'Ship' } };
export const Disabled: Story = { args: { variant: 'primary', disabled: true } };
/** A button that can wait: it keeps room for the spinner, so it doesn't widen when it starts. */
export const Ready: Story = { args: { variant: 'primary', pending: false, children: 'Connect Jira' } };
export const Pending: Story = { args: { variant: 'primary', pending: true, children: 'Connect Jira' } };

export const WithIcon: Story = {
  args: {
    variant: 'primary',
    children: (
      <>
        <Icon icon={GitPullRequestIcon} aria-hidden />
        Create pull request
      </>
    ),
  },
};

/** Icon-only buttons are `IconButton`s, which add the tooltip (spec 020). */
export const AsLink: Story = {
  args: { asChild: true, children: <a href="#settings">Open settings</a> },
};
