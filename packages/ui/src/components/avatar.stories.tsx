import type { Meta, StoryObj } from '@storybook/react-vite';
import { Avatar } from './avatar.tsx';

const meta = { title: 'Components/Avatar', component: Avatar, args: { initials: 'RD' } } satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { label: 'Assigned to you' } };
export const Large: Story = { args: { size: 'lg' } };
export const Decorative: Story = {};
