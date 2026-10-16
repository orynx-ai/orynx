import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pill } from './pill.tsx';

const meta = { title: 'Components/Pill', component: Pill, args: { children: 'To do' } } satisfies Meta<typeof Pill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
export const InProgress: Story = { args: { tone: 'warning', children: 'In progress' } };
export const InReview: Story = { args: { tone: 'info', children: 'In review' } };
export const Done: Story = { args: { tone: 'success', children: 'Done' } };
export const ChecksFailing: Story = { args: { tone: 'danger', children: 'Checks failing' } };
export const Waiting: Story = { args: { tone: 'warning', children: 'No reply · 3 h' } };
export const Plain: Story = { args: { plain: true, children: 'Story' } };
