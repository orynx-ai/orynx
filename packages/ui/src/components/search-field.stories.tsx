import type { Meta, StoryObj } from '@storybook/react-vite';
import { SearchField } from './search-field.tsx';

const meta = {
  title: 'Components/SearchField',
  component: SearchField,
  args: { 'aria-label': 'Search tickets', placeholder: 'Search tickets', className: 'w-60' },
} satisfies Meta<typeof SearchField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty, with its placeholder. */
export const Empty: Story = {};
/** With words typed in. */
export const Filled: Story = { args: { defaultValue: 'bulk archive' } };
/** Full width, as it is on a 360 px phone. */
export const FullWidth: Story = {
  args: { className: 'w-full' },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};
