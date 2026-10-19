import type { Meta, StoryObj } from '@storybook/react-vite';
import { Slider } from './slider.tsx';

const meta = {
  title: 'Components/Slider',
  component: Slider,
  args: { 'aria-label': 'Volume', min: 0, max: 100, step: 5, defaultValue: 60, 'aria-valuetext': '60%' },
  decorators: [
    (Story) => (
      <div className="max-w-xs">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
