import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from './checkbox.tsx';

const meta = {
  title: 'Components/Checkbox',
  component: Checkbox,
  args: { label: 'Pull requests waiting for my review' },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked: Story = {};
export const Checked: Story = { args: { defaultChecked: true } };
export const Disabled: Story = { args: { disabled: true } };
export const DisabledChecked: Story = { args: { disabled: true, defaultChecked: true } };
export const LongLabel: Story = {
  args: {
    defaultChecked: true,
    label:
      'My pull requests with unresolved review comments, including comments on files the pull request no longer changes',
  },
};
