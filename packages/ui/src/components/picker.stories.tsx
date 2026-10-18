import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Folder01Icon, PlusSignIcon, Settings02Icon } from '@hugeicons/core-free-icons';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from './menu.tsx';
import { Picker } from './picker.tsx';
import { Icon } from './icon.tsx';

const meta = {
  title: 'Components/Picker',
  component: Picker,
  args: { icon: <Icon icon={Folder01Icon} />, children: 'web-app' },
} satisfies Meta<typeof Picker>;

export default meta;
type Story = StoryObj<typeof meta>;

function RepositoryMenu({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [folder, setFolder] = useState('web-app');
  return (
    <Menu defaultOpen={defaultOpen} modal={false}>
      <MenuTrigger asChild>
        <Picker icon={<Icon icon={Folder01Icon} />}>{folder}</Picker>
      </MenuTrigger>
      <MenuContent aria-label="Repository" className="w-75">
        <MenuLabel>On this computer</MenuLabel>
        <MenuRadioGroup value={folder} onValueChange={setFolder}>
          <MenuRadioItem value="web-app" icon={<Icon icon={Folder01Icon} />} path="~/code/web-app">
            web-app
          </MenuRadioItem>
          <MenuRadioItem value="api" icon={<Icon icon={Folder01Icon} />} path="~/code/api">
            api
          </MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem icon={<Icon icon={PlusSignIcon} />}>Add local folder</MenuItem>
        <MenuItem icon={<Icon icon={Settings02Icon} />} asChild>
          <a href="#settings">Manage folders</a>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** The Composer's folder picker, open: the picked folder has the check. */
export const Repository: Story = {
  render: () => (
    <div className="min-h-80">
      <RepositoryMenu defaultOpen />
    </div>
  ),
};

/** The agent picker: Claude with its connection dot, opening its menu. */
export const Agent: Story = {
  render: () => (
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
  ),
};

export const LongName: Story = {
  args: { children: 'notifications-and-digest-emails-service' },
  decorators: [
    (Story) => (
      <div className="max-w-48">
        <Story />
      </div>
    ),
  ],
};

/** Nothing to offer yet: the trigger is disabled and the picker takes the Button's disabled look. */
export const Disabled: Story = {
  render: () => (
    <Menu>
      <MenuTrigger asChild disabled>
        <Picker>Reason</Picker>
      </MenuTrigger>
      <MenuContent aria-label="Reason" />
    </Menu>
  ),
};

/** Home's filters: plain pickers in a row, a filled ink count on the ones with ticks. */
export const Filters: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Picker variant="plain">Connections</Picker>
      <Picker variant="plain" count={1}>
        Status
      </Picker>
      <Picker variant="plain" count={12}>
        Workspace
      </Picker>
      <Picker variant="plain">Type</Picker>
    </div>
  ),
};

/** Near the bottom of the window the menu opens above the picker, so it stays in view. */
export const NearTheBottom: Story = {
  render: () => (
    <div className="fixed start-4 bottom-4">
      <RepositoryMenu />
    </div>
  ),
};
