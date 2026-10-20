import type { Meta, StoryObj } from '@storybook/react-vite';
import { Calendar } from './calendar.tsx';

const meta = {
  title: 'Components/Calendar',
  component: Calendar,
  args: { mode: 'single', defaultMonth: new Date(2026, 9, 1) },
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** October 2026 with nothing picked; days of the months either side are quieter. */
export const Default: Story = {};

/** A day picked: it's filled in `primary`. */
export const Picked: Story = { args: { mode: 'single', selected: new Date(2026, 9, 24) } };

/** Days before 20 Oct can't be picked. */
export const SomeDaysDisabled: Story = { args: { mode: 'single', disabled: { before: new Date(2026, 9, 20) } } };
