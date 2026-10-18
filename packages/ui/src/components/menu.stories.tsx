import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { File, Folder, GitBranch, Plus, Settings } from 'lucide-react';
import { Button } from './button.tsx';
import { Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from './menu.tsx';
import { Picker } from './picker.tsx';
import { SourceMark } from './source-mark.tsx';

const meta = {
  title: 'Components/Menu',
  component: Menu,
  // Open from the start, so the story shows the menu; Esc closes it and the trigger opens it again.
  args: { defaultOpen: true, modal: false },
  decorators: [
    (Story) => (
      <div className="min-h-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Menu>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The + button in the Composer: what Claude can work from. Each kind leads on to a list (spec 015).
 * Home draws these icons quieter than the words, so they are passed in `text-muted-foreground`.
 */
export const AddContext: Story = {
  render: (args) => (
    <Menu {...args}>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Add context">
          <Plus aria-hidden />
        </Button>
      </MenuTrigger>
      <MenuContent
        aria-label="Add context"
        className="w-80"
        foot="Tip: you can also paste a Jira key or a pull request link into the box."
      >
        <MenuLabel>Add context for Claude</MenuLabel>
        <MenuItem
          icon={<GitBranch className="text-muted-foreground" />}
          description="The folder Claude works in"
          leadsOn
        >
          Git repository
        </MenuItem>
        <MenuItem icon={<SourceMark source="jira" label="none" />} description="Search by key or title" leadsOn>
          Jira ticket
        </MenuItem>
        <MenuItem
          icon={<SourceMark source="github" label="none" />}
          description="Search by repo, number or title"
          leadsOn
        >
          Pull request
        </MenuItem>
        <MenuItem
          icon={<SourceMark source="slack" label="none" />}
          description="Search by words, person or channel"
          leadsOn
        >
          Slack thread
        </MenuItem>
        <MenuItem icon={<File className="text-muted-foreground" />} description="Opens your computer's file dialog">
          File from this computer
        </MenuItem>
      </MenuContent>
    </Menu>
  ),
};

/** Folders with their paths in mono, then actions after a separator; Manage folders is a link. */
export const Folders: Story = {
  render: (args) => (
    <Menu {...args}>
      <MenuTrigger asChild>
        <Button>Folders</Button>
      </MenuTrigger>
      <MenuContent aria-label="Folders">
        <MenuLabel>On this computer</MenuLabel>
        <MenuItem icon={<Folder />} path="~/code/web-app">
          web-app
        </MenuItem>
        <MenuItem icon={<Folder />} path="~/code/platform/services/notifications-and-digest-emails">
          notifications-and-digest-emails
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Plus />}>Add local folder</MenuItem>
        <MenuItem icon={<Settings />} asChild>
          <a href="#settings">Manage folders</a>
        </MenuItem>
      </MenuContent>
    </Menu>
  ),
};

function ReasonFilter() {
  const reasons = ['Approve command', 'Checks failing', 'Review requested', 'Unresolved comments'];
  const [ticked, setTicked] = useState<string[]>(['Checks failing', 'Review requested']);
  return (
    <Menu defaultOpen modal={false}>
      <MenuTrigger asChild>
        <Picker>{ticked.length === 0 ? 'Reason' : `Reason · ${String(ticked.length)}`}</Picker>
      </MenuTrigger>
      <MenuContent aria-label="Reason">
        {reasons.map((reason) => (
          <MenuCheckboxItem
            key={reason}
            checked={ticked.includes(reason)}
            onCheckedChange={(on) => {
              setTicked((now) => (on ? [...now, reason] : now.filter((each) => each !== reason)));
            }}
          >
            {reason}
          </MenuCheckboxItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

/** A filter on Home's toolbar: ticked options carry the check, and the menu stays open while you tick. */
export const Filter: Story = {
  render: () => (
    <div className="min-h-72">
      <ReasonFilter />
    </div>
  ),
};
