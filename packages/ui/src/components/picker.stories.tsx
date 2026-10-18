import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Folder, Plus, Settings } from 'lucide-react';
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

const meta = {
  title: 'Components/Picker',
  component: Picker,
  args: { icon: <Folder />, children: 'web-app' },
} satisfies Meta<typeof Picker>;

export default meta;
type Story = StoryObj<typeof meta>;

function RepositoryMenu({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [folder, setFolder] = useState('web-app');
  return (
    <Menu defaultOpen={defaultOpen} modal={false}>
      <MenuTrigger asChild>
        <Picker icon={<Folder />}>{folder}</Picker>
      </MenuTrigger>
      <MenuContent aria-label="Repository" className="w-75">
        <MenuLabel>On this computer</MenuLabel>
        <MenuRadioGroup value={folder} onValueChange={setFolder}>
          <MenuRadioItem value="web-app" icon={<Folder />} path="~/code/web-app">
            web-app
          </MenuRadioItem>
          <MenuRadioItem value="api" icon={<Folder />} path="~/code/api">
            api
          </MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem icon={<Plus />}>Add local folder</MenuItem>
        <MenuItem icon={<Settings />} asChild>
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

/** Near the bottom of the window the menu opens above the picker, so it stays in view. */
export const NearTheBottom: Story = {
  render: () => (
    <div className="fixed start-4 bottom-4">
      <RepositoryMenu />
    </div>
  ),
};
