import type { Meta, StoryObj } from '@storybook/react-vite';
import { SourceMark } from './source-mark.tsx';

const meta = { title: 'Components/SourceMark', component: SourceMark, args: { source: 'jira' } } satisfies Meta<
  typeof SourceMark
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Jira: Story = {};
export const GitHub: Story = { args: { source: 'github' } };
export const Slack: Story = { args: { source: 'slack' } };
export const Large: Story = { args: { source: 'slack', size: 'lg' } };
export const MarkOnly: Story = { args: { source: 'jira', size: 'lg', label: 'none' } };
export const NameForScreenReadersOnly: Story = { args: { source: 'github', label: 'hidden' } };
