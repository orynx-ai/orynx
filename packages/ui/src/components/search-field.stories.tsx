import type { Meta, StoryObj } from '@storybook/react-vite';
import { SearchField } from './search-field.tsx';

/** A search box: an Input with the search icon and an `aria-label`, as the page bar draws "Search tickets". */
const meta = {
  title: 'Components/SearchField',
  component: SearchField,
  args: { 'aria-label': 'Search tickets', placeholder: 'Search tickets', className: 'w-55 max-w-full' },
} satisfies Meta<typeof SearchField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** 32 px, for the Tickets page bar and Home's toolbar (specs 007 Q10b, 008 Q10c). */
export const Small: Story = { args: { size: 'sm' } };
export const WithValue: Story = { args: { size: 'sm', defaultValue: 'bulk archive' } };
export const Disabled: Story = { args: { disabled: true } };
/** Full width, as it is on a 360 px phone. */
export const FullWidth: Story = {
  args: { size: 'sm', className: 'w-full' },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};
