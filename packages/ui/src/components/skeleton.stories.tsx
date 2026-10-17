import type { Meta, StoryObj } from '@storybook/react-vite';
import { Skeleton } from './skeleton.tsx';

const meta = {
  title: 'Components/Skeleton',
  component: Skeleton,
  args: { className: 'h-6 w-40' },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Line: Story = {};
export const Circle: Story = { args: { shape: 'circle', className: 'size-7' } };
/** A text line and its meta line, as a row's loading form puts them. */
export const TwoLines: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-1" aria-busy>
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
    </div>
  ),
};
