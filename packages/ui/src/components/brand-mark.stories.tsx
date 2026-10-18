import type { Meta, StoryObj } from '@storybook/react-vite';
import { BrandMark } from './brand-mark.tsx';

const meta = { title: 'Components/BrandMark', component: BrandMark } satisfies Meta<typeof BrandMark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mark: Story = {};

/** As the sidebar shows it: the mark, then the name in the title size. */
export const WithName: Story = {
  render: () => (
    <span className="flex items-center gap-2">
      <BrandMark />
      <span className="text-title font-medium">Orynx</span>
    </span>
  ),
};
