import type { Meta, StoryObj } from '@storybook/react-vite';
import { CommandLine } from './command-line.tsx';

const meta = {
  title: 'Components/CommandLine',
  component: CommandLine,
  args: { command: 'npm test -- agent-builder' },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CommandLine>;

export default meta;
type Story = StoryObj<typeof meta>;

const long =
  'cd packages/agent-builder/src; grep -n "uploading\\|onUpload\\|onChange" components/settings-sections/avatar-picker.tsx | head -40; cat hooks/use-avatar-upload.tsx';

export const Short: Story = {};
/** Cut to one line. */
export const Long: Story = { args: { command: long } };
/** Pressed: in full, wrapped. */
export const LongOpen: Story = { args: { command: long, defaultOpen: true } };
