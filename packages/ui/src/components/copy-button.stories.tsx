import type { Meta, StoryObj } from '@storybook/react-vite';
import { CopyButton } from './copy-button.tsx';

const meta = {
  title: 'Components/CopyButton',
  component: CopyButton,
  args: { text: 'src/content/ContentList.tsx' },
} satisfies Meta<typeof CopyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Always there, as in a diff's header. Press it to see "Copied". */
export const Always: Story = {};

/** In a row, showing only while the pointer is over it or something in it has focus. */
export const OnHover: Story = {
  render: (args) => (
    <div className="group flex max-w-md items-center gap-2 rounded-sm border border-border px-3 py-1">
      <span className="min-w-0 flex-1 truncate font-mono text-code">{args.text}</span>
      <CopyButton {...args} reveal="hover" />
    </div>
  ),
};
