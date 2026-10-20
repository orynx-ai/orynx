import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusDot } from './status-dot.tsx';

const meta = { title: 'Components/StatusDot', component: StatusDot, args: { tone: 'success' } } satisfies Meta<
  typeof StatusDot
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Worked: Story = {};
export const NeedsAttention: Story = { args: { tone: 'warning' } };
export const Failed: Story = { args: { tone: 'danger' } };
export const Off: Story = { args: { tone: 'off' } };
