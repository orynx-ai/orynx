import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Combobox, type ComboboxOption } from './combobox.tsx';
import { Field } from './field.tsx';
import { Picker } from './picker.tsx';

const projects: ComboboxOption[] = [
  { value: '', label: 'No Jira project' },
  { value: 'MOB', label: 'MOB · Mobile' },
  { value: 'PROJ', label: 'PROJ · Intranet' },
  { value: 'WEB', label: 'WEB · Website' },
  { value: 'DATA', label: 'DATA · Data platform' },
  { value: 'OPS', label: 'OPS · Operations' },
];

function ProjectField({ start, disabled }: { start: string; disabled?: boolean }) {
  const [value, setValue] = useState(start);
  return (
    <Field label="Jira project" help="Tickets from this project open in this folder." className="max-w-120">
      <Combobox
        options={projects}
        value={value}
        onValueChange={setValue}
        searchLabel="Search Jira projects"
        emptyText="No projects match"
        disabled={disabled ?? false}
      />
    </Field>
  );
}

const meta = {
  title: 'Components/Combobox',
  component: Combobox,
  args: { options: projects, value: '', onValueChange: () => undefined, searchLabel: 'Search', emptyText: 'No match' },
  decorators: [
    (Story) => (
      <div className="min-h-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Combobox>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The folder dialog's Jira project: press it, then type to narrow the list (spec 020). */
export const InAField: Story = { render: () => <ProjectField start="PROJ" /> };

/** Nothing picked yet: "No Jira project" is the first option. */
export const NothingPicked: Story = { render: () => <ProjectField start="" /> };

/** Jira isn't connected, so there's nothing to pick. */
export const Disabled: Story = { render: () => <ProjectField start="" disabled /> };

/** The list open on the pick, so Storybook's axe check sees it. */
export const Open: Story = {
  render: () => (
    <Combobox
      defaultOpen
      options={projects}
      value="PROJ"
      onValueChange={() => undefined}
      searchLabel="Search Jira projects"
      emptyText="No projects match"
      aria-label="Jira project"
    />
  ),
};

/** The options are on their way: loading rows the size of real ones follow those already here. */
export const Loading: Story = {
  render: () => (
    <Combobox
      defaultOpen
      size="sm"
      options={projects.slice(0, 1)}
      value=""
      onValueChange={() => undefined}
      searchLabel="Search projects"
      emptyText="No projects match"
      loading
    >
      <Picker>Project</Picker>
    </Combobox>
  ),
};

/** Nothing matches the search: one line under the search box, and no options. */
export const NoMatch: Story = {
  render: () => (
    <Combobox
      defaultOpen
      options={[]}
      value=""
      onValueChange={() => undefined}
      searchLabel="Search Jira projects"
      emptyText="No projects match"
      aria-label="Jira project"
    />
  ),
};

/** Tickets' Project picker in its toolbar, opening the same list, compact (spec 020, AC-38, AC-40). */
export const FromAPicker: Story = {
  render: () => (
    <Combobox
      size="sm"
      options={projects.slice(1)}
      value="WEB"
      onValueChange={() => undefined}
      searchLabel="Search projects"
      emptyText="No projects match"
    >
      <Picker>Project: WEB</Picker>
    </Combobox>
  ),
};
