import type { Meta, StoryObj } from '@storybook/react-vite';
import { ResumeBanner } from './resume-banner.tsx';

const meta = {
  title: 'Components/ResumeBanner',
  component: ResumeBanner,
  args: {
    href: '#session',
    title: 'Claude is waiting for your approval',
    detail: 'PROJ-1423 · Add bulk archive · wants to run npm test',
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ResumeBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Home, when a session needs you. */
export const WaitingForApproval: Story = {};
/** A long detail line stays on one line, cut off with an ellipsis; Review stays in full. */
export const LongDetail: Story = {
  args: {
    detail:
      'PROJ-1423 · Add bulk archive to the content list with partial failure reporting · wants to run npm test -- content-list --coverage',
  },
};
