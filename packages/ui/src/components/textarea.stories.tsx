import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field } from './field.tsx';
import { Textarea } from './textarea.tsx';

const description =
  '## What changed\n\n- A checkbox on each row of the content list, and select all\n' +
  '- Archive selected in the toolbar, which reports the items that failed\n\n' +
  '## How it was checked\n\n`npm test -- content-list` passes.\n\n' +
  'Jira: [PROJ-1423](https://your-team.atlassian.net/browse/PROJ-1423)';

/** A pull request's description (spec 014): Input's look over 10 lines, always in a `Field` for its label. */
const meta = {
  title: 'Components/Textarea',
  component: Textarea,
  render: (args) => (
    <div className="max-w-xl">
      <Field label="Description" help="Markdown, as on GitHub.">
        <Textarea {...args} />
      </Field>
    </div>
  ),
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Filled: Story = { args: { defaultValue: description } };
/** Longer than 10 lines: it scrolls inside its box, and the page never moves. */
export const Long: Story = { args: { defaultValue: `${description}\n\n${description}\n\n${description}` } };
export const ReadOnly: Story = { args: { readOnly: true, defaultValue: description } };
export const Disabled: Story = { args: { disabled: true, defaultValue: description } };
export const Invalid: Story = {
  args: { defaultValue: description },
  render: (args) => (
    <div className="max-w-xl">
      <Field label="Description" error="Keep the description under 65,536 characters.">
        <Textarea {...args} />
      </Field>
    </div>
  ),
};
/** A skill's instructions in Settings › Skills (spec 023): the mono face, at least 300 px tall. */
export const Mono: Story = {
  args: {
    mono: true,
    defaultValue:
      '# Bug bash\n\n1. Read the ticket and its acceptance criteria.\n2. Run the existing tests.\n\nDo not change any code. Report only.\n',
  },
};
