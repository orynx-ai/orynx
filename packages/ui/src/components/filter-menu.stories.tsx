import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FilterMenu, type FilterMenuOption } from './filter-menu.tsx';

const assignees: FilterMenuOption[] = [
  { value: 'me', label: 'Me' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'Priya Shah', label: 'Priya Shah' },
  { value: 'Sam Lee', label: 'Sam Lee' },
];

function Assignee({ start }: { start: string[] }) {
  const [ticked, setTicked] = useState(start);
  return <FilterMenu label="Assignee" options={assignees} ticked={ticked} onTickedChange={setTicked} />;
}

const meta = {
  title: 'Components/FilterMenu',
  component: FilterMenu,
  args: { label: 'Assignee', options: assignees, ticked: [], onTickedChange: () => undefined },
  decorators: [
    (Story) => (
      <div className="min-h-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FilterMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Tickets' Assignee filter, Me ticked as it starts (spec 020). */
export const OneTicked: Story = { render: () => <Assignee start={['me']} /> };

/** Nothing ticked: the filter lets every ticket through. */
export const NoneTicked: Story = { render: () => <Assignee start={[]} /> };

/** With a search box over the people, as Tickets' Assignee (the user's call, 19 Oct 2026). */
export const Searchable: Story = {
  args: { searchLabel: 'Search people', emptyText: 'No one matches', size: 'sm', ticked: ['me'] },
};

/** Nothing to offer, as on a tab with no rows. */
export const Empty: Story = { args: { options: [] } };
