import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarDays, Kanban, List, Table } from 'lucide-react';
import { SegmentedControl, SegmentedControlItem } from './segmented-control.tsx';

const meta = {
  title: 'Components/SegmentedControl',
  component: SegmentedControl,
  args: {
    'aria-label': 'View',
    defaultValue: 'board',
    children: (
      <>
        <SegmentedControlItem value="board">
          <Kanban aria-hidden />
          Board
        </SegmentedControlItem>
        <SegmentedControlItem value="list">
          <List aria-hidden />
          List
        </SegmentedControlItem>
      </>
    ),
  },
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Tickets' page bar: Board or List. */
export const BoardOrList: Story = {};
export const SecondPicked: Story = { args: { defaultValue: 'list' } };
/** Four options, the most the design system allows. */
export const FourOptions: Story = {
  args: {
    'aria-label': 'Show',
    defaultValue: 'board',
    children: (
      <>
        <SegmentedControlItem value="board">
          <Kanban aria-hidden />
          Board
        </SegmentedControlItem>
        <SegmentedControlItem value="list">
          <List aria-hidden />
          List
        </SegmentedControlItem>
        <SegmentedControlItem value="table">
          <Table aria-hidden />
          Table
        </SegmentedControlItem>
        <SegmentedControlItem value="calendar">
          <CalendarDays aria-hidden />
          Calendar
        </SegmentedControlItem>
      </>
    ),
  },
};
