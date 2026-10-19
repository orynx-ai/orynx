import type { Meta, StoryObj } from '@storybook/react-vite';
import { Switch } from './switch.tsx';

const meta = {
  title: 'Components/Switch',
  component: Switch,
  args: { 'aria-label': 'Do not disturb' },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {};
export const On: Story = { args: { defaultChecked: true } };
export const Disabled: Story = { args: { disabled: true } };
export const DisabledOn: Story = { args: { disabled: true, defaultChecked: true } };
/** Named by a visible label beside it, as the panel's foot draws it. */
export const WithLabel: Story = {
  render: (args) => (
    <span className="flex items-center gap-2">
      <Switch {...args} id="sounds" aria-label={undefined} defaultChecked />
      <label htmlFor="sounds">Sounds</label>
    </span>
  ),
};
