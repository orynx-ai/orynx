import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { File01Icon, Folder01Icon, GitBranchIcon, PlusSignIcon, Settings02Icon } from '@hugeicons/core-free-icons';
import { Button } from './button.tsx';
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from './menu.tsx';
import { Picker } from './picker.tsx';
import { SourceMark } from './source-mark.tsx';
import { Icon } from './icon.tsx';
import { IconButton } from './icon-button.tsx';

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
        <IconButton variant="ghost" size="sm" label="Add context">
          <Icon icon={PlusSignIcon} aria-hidden />
        </IconButton>
      </MenuTrigger>
      <MenuContent
        aria-label="Add context"
        className="w-80"
        foot="Tip: you can also paste a Jira key or a pull request link into the box."
      >
        <MenuLabel>Add context for Claude</MenuLabel>
        <MenuItem
          icon={<Icon icon={GitBranchIcon} className="text-muted-foreground" />}
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
        <MenuItem
          icon={<Icon icon={File01Icon} className="text-muted-foreground" />}
          description="Opens your computer's file dialog"
        >
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
        <MenuItem icon={<Icon icon={Folder01Icon} />} path="~/code/web-app">
          web-app
        </MenuItem>
        <MenuItem icon={<Icon icon={Folder01Icon} />} path="~/code/platform/services/notifications-and-digest-emails">
          notifications-and-digest-emails
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Icon icon={PlusSignIcon} />}>Add local folder</MenuItem>
        <MenuItem icon={<Icon icon={Settings02Icon} />} asChild>
          <a href="#settings">Manage folders</a>
        </MenuItem>
      </MenuContent>
    </Menu>
  ),
};

function ReasonFilter() {
  const reasons = [
    'Approve command',
    'Checks failing',
    'Review requested',
    'Unresolved comments',
    'A reason long enough to wrap onto a second line 1786112734553434343434',
  ];
  const [ticked, setTicked] = useState<string[]>(['Checks failing', 'Review requested']);
  return (
    <Menu defaultOpen modal={false}>
      <MenuTrigger asChild>
        <Picker variant="plain" count={ticked.length}>
          Reason
        </Picker>
      </MenuTrigger>
      <MenuContent heading="Reason">
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

/**
 * A filter on Home's toolbar: a plain picker with its count, opening a menu headed by the filter's
 * name. Ticked boxes fill with ink, a long name wraps, and the menu stays open while you tick.
 */
export const Filter: Story = {
  render: () => (
    <div className="min-h-72">
      <ReasonFilter />
    </div>
  ),
};

/** Compact, as Tickets' Sprint picker opens it (spec 020): 32 px rows, 14 px words, 12 px dates, at most 360 px tall. */
export const Compact: Story = {
  render: (args) => (
    <Menu {...args}>
      <MenuTrigger asChild>
        <Picker>Sprint 43</Picker>
      </MenuTrigger>
      <MenuContent heading="Sprint" size="sm">
        <MenuRadioGroup value="43">
          {Array.from({ length: 12 }, (_, index) => 43 + index).map((sprint) => (
            <MenuRadioItem key={sprint} value={String(sprint)} description={index(sprint)}>
              Sprint {sprint}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  ),
};

function index(sprint: number): string {
  return sprint === 43 ? 'Active · ends 24 Oct' : 'Future';
}

/** A row that opens more choices beside the menu, as the profile menu's Appearance does. */
export const SubMenu: Story = {
  render: (args) => (
    <Menu {...args}>
      <MenuTrigger asChild>
        <Button>Profile</Button>
      </MenuTrigger>
      <MenuContent aria-label="Profile">
        <MenuSub defaultOpen>
          <MenuSubTrigger icon={<Icon icon={Settings02Icon} aria-hidden />}>Appearance</MenuSubTrigger>
          <MenuSubContent aria-label="Appearance">
            <MenuRadioGroup value="dark">
              <MenuRadioItem value="light">Light</MenuRadioItem>
              <MenuRadioItem value="dark">Dark</MenuRadioItem>
              <MenuRadioItem value="system">System</MenuRadioItem>
            </MenuRadioGroup>
          </MenuSubContent>
        </MenuSub>
        <MenuItem icon={<Icon icon={Settings02Icon} aria-hidden />}>Settings</MenuItem>
      </MenuContent>
    </Menu>
  ),
};
