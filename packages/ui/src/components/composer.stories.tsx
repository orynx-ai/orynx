import type { Meta, StoryObj } from '@storybook/react-vite';
import { Folder, Plus } from 'lucide-react';
import { Button } from './button.tsx';
import { Composer, ComposerBar, ComposerSend, ComposerTextarea } from './composer.tsx';
import { Menu, MenuContent, MenuItem, MenuTrigger } from './menu.tsx';
import { Picker } from './picker.tsx';

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

/** Home: the text box, + Add context, the folder and agent pickers, and Send. */
export const Task: Story = {
  render: (args) => (
    <Composer {...args}>
      <ComposerTextarea
        name="task"
        label="Describe a task for Claude"
        placeholder="Describe a task, or paste a Jira key like PROJ-1423"
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
  ),
};
