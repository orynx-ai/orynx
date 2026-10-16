import type { Meta, StoryObj } from '@storybook/react-vite';
import { Kbd } from './kbd.tsx';

const meta = { title: 'Components/Kbd', component: Kbd, args: { children: '⌘K' } } satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NewTask: Story = { args: { children: '⌘N' } };
