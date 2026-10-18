import type { Meta, StoryObj } from '@storybook/react-vite';
import { GitPullRequestIcon, Refresh04Icon, SparklesIcon } from '@hugeicons/core-free-icons';
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
export const Danger: Story = { args: { variant: 'danger', children: 'Discard changes' } };
/** The quiet one `session.html` draws under the changes: ghost, danger text, a confirm step before it acts. */
export const DangerGhost: Story = { args: { variant: 'danger-ghost', size: 'sm', children: 'Discard changes' } };
export const Small: Story = { args: { variant: 'primary', size: 'sm', children: 'Build with Claude' } };
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

export const IconOnly: Story = {
  args: { size: 'icon', 'aria-label': 'Refresh', children: <Icon icon={Refresh04Icon} aria-hidden /> },
};

export const SmallIconGhost: Story = {
  args: {
    variant: 'ghost',
    size: 'icon-sm',
    'aria-label': 'Build PROJ-1377 with Claude',
    children: <Icon icon={SparklesIcon} aria-hidden />,
  },
};

export const AsLink: Story = {
  args: { asChild: true, children: <a href="#settings">Open settings</a> },
};
