import type { ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileText, Folder, Plus } from 'lucide-react';
import { Button } from './button.tsx';
import { Composer, ComposerBar, ComposerSend, ComposerTextarea } from './composer.tsx';
import { ContextChip, ContextList } from './context-chip.tsx';
import { Menu, MenuContent, MenuItem, MenuTrigger } from './menu.tsx';
import { Picker } from './picker.tsx';
import { SourceMark } from './source-mark.tsx';

const meta = {
  title: 'Components/Composer',
  component: Composer,
  args: {
    onSubmit: (event) => {
      event.preventDefault();
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Composer>;

export default meta;
type Story = StoryObj<typeof meta>;

function HomeComposer({
  text,
  withContext = false,
  ...args
}: ComponentProps<typeof Composer> & { text?: string; withContext?: boolean }) {
  return (
    <Composer {...args}>
      {withContext ? (
        <ContextList aria-label="Context for Claude">
          <ContextChip label="PROJ-1423" icon={<SourceMark source="jira" label="none" />} onRemove={() => undefined} />
          <ContextChip label="bulk-archive-spec.pdf" icon={<FileText />} onRemove={() => undefined} />
        </ContextList>
      ) : null}
      <ComposerTextarea
        name="task"
        label="Describe a task for Claude"
        placeholder="Describe a task, or paste a Jira key like PROJ-1423"
        defaultValue={text}
      />
      <ComposerBar>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Add context">
              <Plus aria-hidden />
            </Button>
          </MenuTrigger>
          <MenuContent aria-label="Add context">
            <MenuItem>Jira ticket</MenuItem>
          </MenuContent>
        </Menu>
        <Picker icon={<Folder />}>web-app</Picker>
        <Picker icon={<span aria-hidden className="size-2 rounded-full bg-success" />}>Claude</Picker>
        <ComposerSend label="Send to Claude" />
      </ComposerBar>
    </Composer>
  );
}

/** Home: the text box, + Add context, the folder and agent pickers, and Send. */
export const Task: Story = { render: (args) => <HomeComposer {...args} /> };
/** With a Jira ticket and a file added through + Add context. */
export const WithContext: Story = {
  render: (args) => <HomeComposer {...args} withContext />,
};
/** Nothing to send yet: Send stays focusable but reads as unavailable. */
export const NothingToSend: Story = { render: (args) => <HomeComposer {...args} canSend={false} /> };
/** A send on its way: Send shows its spinner, and the text stays. */
export const Sending: Story = {
  render: (args) => <HomeComposer {...args} pending text="Add bulk archive to the content list" />,
};
/** More than 8 lines: the text box stops growing and scrolls inside itself. */
export const LongText: Story = {
  render: (args) => (
    <HomeComposer
      {...args}
      text={Array.from({ length: 12 }, (_, line) => `Line ${String(line + 1)} of the brief`).join('\n')}
    />
  ),
};
