import type { ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { File02Icon, Folder01Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { Button } from './button.tsx';
import { Composer, ComposerBar, ComposerHint, ComposerSend, ComposerTextarea } from './composer.tsx';
import { ContextChip, ContextList } from './context-chip.tsx';
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuTrigger } from './menu.tsx';
import { Picker } from './picker.tsx';
import { SourceMark } from './source-mark.tsx';
import { Icon } from './icon.tsx';

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
          <ContextChip label="bulk-archive-spec.pdf" icon={<Icon icon={File02Icon} />} onRemove={() => undefined} />
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
              <Icon icon={PlusSignIcon} aria-hidden />
            </Button>
          </MenuTrigger>
          <MenuContent aria-label="Add context">
            <MenuItem>Jira ticket</MenuItem>
          </MenuContent>
        </Menu>
        <Menu>
          <MenuTrigger asChild>
            <Picker icon={<Icon icon={Folder01Icon} />}>web-app</Picker>
          </MenuTrigger>
          <MenuContent aria-label="Repository">
            <MenuRadioGroup value="web-app">
              <MenuRadioItem value="web-app" icon={<Icon icon={Folder01Icon} />} path="~/code/web-app">
                web-app
              </MenuRadioItem>
            </MenuRadioGroup>
          </MenuContent>
        </Menu>
        <Menu>
          <MenuTrigger asChild>
            <Picker icon={<span aria-hidden className="size-2 rounded-full bg-success" />}>Claude</Picker>
          </MenuTrigger>
          <MenuContent aria-label="Agent">
            <MenuRadioGroup value="claude">
              <MenuRadioItem value="claude">Claude</MenuRadioItem>
            </MenuRadioGroup>
          </MenuContent>
        </Menu>
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

/** The Session screen's follow-up box: one line, the keys, and a secondary Send. */
export const FollowUp: Story = {
  render: (args) => (
    <div className="rounded-md border border-border bg-sidebar p-4">
      <Composer {...args} look="follow-up">
        <ComposerTextarea name="message" label="Message Claude" placeholder="Ask Claude to change something" />
        <ComposerBar>
          <ComposerHint>Enter to send · Shift+Enter for a new line</ComposerHint>
          <ComposerSend label="Send message" />
        </ComposerBar>
      </Composer>
    </div>
  ),
};
