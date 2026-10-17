import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stepper } from './stepper.tsx';

const meta = {
  title: 'Components/Stepper',
  component: Stepper,
  args: {
    'aria-label': 'Session progress',
    steps: ['Plan', 'Build', 'Test', 'Review', 'Pull request'],
    current: 2,
  },
} satisfies Meta<typeof Stepper>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Session screen: Claude is testing. */
export const Testing: Story = {};
export const JustStarted: Story = { args: { current: 0 } };
export const AllDone: Story = { args: { current: 5 } };
/** A narrow column: the steps wrap onto a second line and nothing is cut off. */
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className="max-w-72">
        <Story />
      </div>
    ),
  ],
};
