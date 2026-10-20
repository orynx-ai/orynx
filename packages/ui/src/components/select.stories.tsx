import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field } from './field.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select.tsx';

const sounds = ['None', 'Knock', 'Chime', 'Ping'];

const meta = {
  title: 'Components/Select',
  component: Select,
  args: { defaultValue: 'Knock' },
  render: (args) => (
    <Field label="Sound" help="Plays when Claude is waiting." className="max-w-xs">
      <Select {...args}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sounds.map((sound) => (
            <SelectItem key={sound} value={sound}>
              {sound}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  ),
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const Invalid: Story = {
  render: (args) => (
    <Field label="to" error="Quiet hours need a different start and end." className="max-w-xs">
      <Select {...args}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sounds.map((sound) => (
            <SelectItem key={sound} value={sound}>
              {sound}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  ),
};
export const Open: Story = { args: { defaultOpen: true } };
/** Every half hour, as quiet hours list them: the list scrolls inside itself, with arrows at its ends. */
export const LongList: Story = {
  args: { defaultValue: '19:00', defaultOpen: true },
  render: (args) => (
    <Field label="From" className="w-36">
      <Select {...args}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: 48 }, (_, index) => {
            const time = `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '00' : '30'}`;
            return (
              <SelectItem key={time} value={time}>
                {time}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </Field>
  ),
};
