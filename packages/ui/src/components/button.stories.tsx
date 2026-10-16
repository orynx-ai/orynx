import type { Meta, StoryObj } from '@storybook/react-vite';
import { GitPullRequest, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from './button.tsx';

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
export const Small: Story = { args: { variant: 'primary', size: 'sm', children: 'Build with Claude' } };
export const Disabled: Story = { args: { variant: 'primary', disabled: true } };

export const WithIcon: Story = {
  args: {
    variant: 'primary',
    children: (
      <>
        <GitPullRequest aria-hidden />
        Create pull request
      </>
    ),
  },
};

export const IconOnly: Story = {
  args: { size: 'icon', 'aria-label': 'Refresh', children: <RefreshCw aria-hidden /> },
};

export const SmallIconGhost: Story = {
  args: {
    variant: 'ghost',
    size: 'icon-sm',
    'aria-label': 'Build PROJ-1377 with Claude',
    children: <Sparkles aria-hidden />,
  },
};

export const AsLink: Story = {
  args: { asChild: true, children: <a href="#settings">Open settings</a> },
};
