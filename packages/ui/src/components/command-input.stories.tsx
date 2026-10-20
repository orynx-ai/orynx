import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { CommandInput, type CommandInputProps } from './command-input.tsx';

const meta = {
  title: 'Components/CommandInput',
  component: CommandInput,
  args: {
    label: 'Command',
    hint: '↑ history · Enter to run',
    placeholder: 'Type a command. Try git status, npm test or ls',
  },
} satisfies Meta<typeof CommandInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Busy: Story = {
  args: { placeholder: 'pnpm dev is running. ⌃C stops it, or + opens another terminal.' },
};

/** As the Terminal's form uses it: ↑ and ↓ put earlier commands in the field. */
function WithForm(props: CommandInputProps) {
  const [value, setValue] = useState('');
  return (
    <CommandInput
      {...props}
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
      }}
      onRecall={setValue}
    />
  );
}

export const WithHistory: Story = {
  args: { history: ['git status', 'npm test -- content-list', 'git diff --stat'] },
  render: (args) => <WithForm {...args} />,
};
