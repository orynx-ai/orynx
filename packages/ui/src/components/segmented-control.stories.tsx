import type { Meta, StoryObj } from '@storybook/react-vite';
import { Calendar03Icon, KanbanIcon, LayoutTable01Icon, LeftToRightListBulletIcon } from '@hugeicons/core-free-icons';
import { SegmentedControl, SegmentedControlItem } from './segmented-control.tsx';
import { Icon } from './icon.tsx';

const meta = {
  title: 'Components/SegmentedControl',
  component: SegmentedControl,
  args: {
    'aria-label': 'View',
    defaultValue: 'board',
    children: (
      <>
        <SegmentedControlItem value="board">
          <Icon icon={KanbanIcon} aria-hidden />
          Board
        </SegmentedControlItem>
        <SegmentedControlItem value="list">
          <Icon icon={LeftToRightListBulletIcon} aria-hidden />
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
/** A setting's row, as Settings › Coding agent draws Push the branch: Block turns `danger` once pressed. */
export const DangerOption: Story = {
  args: {
    'aria-label': 'Push the branch',
    defaultValue: 'never',
    children: (
      <>
        <SegmentedControlItem value="allow">Allow</SegmentedControlItem>
        <SegmentedControlItem value="ask">Ask</SegmentedControlItem>
        <SegmentedControlItem value="never" tone="danger">
          Block
        </SegmentedControlItem>
      </>
    ),
  },
};
/** While its value loads: nothing pressed, and no option can be pressed. */
export const Disabled: Story = {
  args: {
    'aria-label': 'Edit files',
    defaultValue: undefined,
    children: (
      <>
        <SegmentedControlItem value="allow" disabled>
          Allow
        </SegmentedControlItem>
        <SegmentedControlItem value="ask" disabled>
          Ask
        </SegmentedControlItem>
      </>
    ),
  },
};
/** Four options, the most the design system allows. */
export const FourOptions: Story = {
  args: {
    'aria-label': 'Show',
    defaultValue: 'board',
    children: (
      <>
        <SegmentedControlItem value="board">
          <Icon icon={KanbanIcon} aria-hidden />
          Board
        </SegmentedControlItem>
        <SegmentedControlItem value="list">
          <Icon icon={LeftToRightListBulletIcon} aria-hidden />
          List
        </SegmentedControlItem>
        <SegmentedControlItem value="table">
          <Icon icon={LayoutTable01Icon} aria-hidden />
          Table
        </SegmentedControlItem>
        <SegmentedControlItem value="calendar">
          <Icon icon={Calendar03Icon} aria-hidden />
          Calendar
        </SegmentedControlItem>
      </>
    ),
  },
};
