import type { Meta, StoryObj } from '@storybook/react-vite';
import { AgentChip } from './agent-chip.tsx';

const meta = {
  title: 'Components/AgentChip',
  component: AgentChip,
  args: { state: 'needs_you', href: '#session' },
} satisfies Meta<typeof AgentChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NeedsYou: Story = {};
export const Working: Story = { args: { state: 'working' } };
export const ReadyForPr: Story = { args: { state: 'done' } };
export const PrOpen: Story = { args: { state: 'pr_open' } };
export const PrMerged: Story = { args: { state: 'pr_merged' } };
export const PrClosed: Story = { args: { state: 'pr_closed' } };
export const Stopped: Story = { args: { state: 'stopped' } };
