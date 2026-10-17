import type { Meta, StoryObj } from '@storybook/react-vite';
import { SearchField } from './search-field.tsx';

/** A search box: an Input with the search icon and an `aria-label`, as the page bar draws "Search tickets". */
const meta = {
  title: 'Components/SearchField',
  component: SearchField,
  args: { 'aria-label': 'Search tickets', placeholder: 'Search tickets' },
  decorators: [
    (Story) => (
      <div className="w-55 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SearchField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** 32 px, for the page bar (spec 008, Q10c). */
export const Small: Story = { args: { size: 'sm' } };
export const WithValue: Story = { args: { size: 'sm', defaultValue: 'bulk archive' } };
export const Disabled: Story = { args: { disabled: true } };
