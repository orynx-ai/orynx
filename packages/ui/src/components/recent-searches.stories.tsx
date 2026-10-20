import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { RecentSearches } from './recent-searches.tsx';
import { SearchField } from './search-field.tsx';

const meta = {
  title: 'Components/RecentSearches',
  component: RecentSearches,
  args: {
    items: ['jira', 'terminal', 'MAI-5337', 'failing checks', 'login page'],
    onPick: fn(),
    onRemove: fn(),
    onClear: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex w-90 flex-col gap-2 p-3">
        <SearchField aria-label="Search sessions" placeholder="Search sessions" />
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RecentSearches>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Five searches, the most it keeps (spec 039). */
export const Default: Story = {};

/** One search. */
export const One: Story = { args: { items: ['jira'] } };

/** A long search is cut short with an ellipsis, and its remove button stays in reach. */
export const LongSearch: Story = {
  args: { items: ['Show read receipts for every announcement in the analytics dashboard', 'jira'] },
};

/** As a page draws it under its search field: a raised panel over the page. */
export const Floating: Story = { args: { floating: true } };
