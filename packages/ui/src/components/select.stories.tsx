import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field } from './field.tsx';
import { Select } from './select.tsx';

const projects = [
  { key: 'MOB', name: 'Mobile' },
  { key: 'PROJ', name: 'Intranet' },
  { key: 'WEB', name: 'Website' },
];

const options = (
  <>
    <option value="">No Jira project</option>
    {projects.map((project) => (
      <option key={project.key} value={project.key}>
        {project.key} · {project.name}
      </option>
    ))}
  </>
);

const meta = {
  title: 'Components/Select',
  component: Select,
  args: { defaultValue: '', children: options },
  render: (args) => (
    <Field label="Jira project" help="Tickets from this project open in this folder." className="max-w-md">
      <Select {...args} />
    </Field>
  ),
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Picked: Story = { args: { defaultValue: 'PROJ' } };
export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => (
    <Field label="Jira project" help="Connect Jira in Connections to pick a project." className="max-w-md">
      <Select {...args} />
    </Field>
  ),
};
export const Invalid: Story = {
  render: (args) => (
    <Field label="Jira project" error="Pick a Jira project." className="max-w-md">
      <Select {...args} />
    </Field>
  ),
};
export const LongList: Story = {
  args: {
    children: (
      <>
        <option value="">No Jira project</option>
        {Array.from({ length: 200 }, (_, index) => (
          <option key={index} value={`P${String(index)}`}>
            P{index} · A project with a fairly long name, number {index}
          </option>
        ))}
      </>
    ),
  },
};
