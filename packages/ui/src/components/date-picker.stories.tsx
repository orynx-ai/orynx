import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DatePicker } from './date-picker.tsx';
import { Field } from './field.tsx';

function Due({ initial, error }: { initial: string | null; error?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <Field label="Due date" className="w-64" {...(error === undefined ? {} : { error })}>
      <DatePicker value={value} onValueChange={setValue} placeholder="Pick a date" clearLabel="Clear date" />
    </Field>
  );
}

const meta = {
  title: 'Components/DatePicker',
  component: Due,
  args: { initial: null },
  decorators: [
    (Story) => (
      <div className="min-h-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Due>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No day yet: the field reads "Pick a date" in the placeholder's colour. */
export const Empty: Story = {};

/** A day picked: the calendar opens on it, with Clear date under it. */
export const Picked: Story = { args: { initial: '2026-10-24' } };

/** Its field's error under it, and the field in `danger`. */
export const Invalid: Story = { args: { initial: null, error: 'Pick a day.' } };
