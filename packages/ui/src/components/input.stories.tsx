import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './input.tsx';

/** On its own, an input needs an `aria-label`. With a visible label, use `Field` (see Components/Field). */
const meta = {
  title: 'Components/Input',
  component: Input,
  args: { 'aria-label': 'Search tickets', type: 'search', placeholder: 'Search tickets' },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Search: Story = {};
export const WithValue: Story = { args: { defaultValue: 'bulk archive' } };
export const Disabled: Story = { args: { disabled: true, defaultValue: 'your-team.atlassian.net' } };
export const Invalid: Story = { args: { 'aria-invalid': true, defaultValue: 'your-team.atlasian.net' } };
