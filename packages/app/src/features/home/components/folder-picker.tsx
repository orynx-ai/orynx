import { useRef, useState } from 'react';
import { Folder01Icon, PlusSignIcon, Settings02Icon } from '@hugeicons/core-free-icons';
import { Link } from '@tanstack/react-router';
import {
  Icon,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  Picker,
  Skeleton,
} from '@devhub/ui';
import { FolderDialog } from '../../settings/components/folder-dialog.tsx';
import { useRepositories } from '../../settings/queries.ts';
import { folderFor } from '../composer-rules.ts';
import { composerWords } from '../composer-words.ts';
import { useComposerStore } from '../store.ts';

const words = composerWords.folder;

function projectOf(key: string | null): string | undefined {
  return key === null ? undefined : key.slice(0, key.lastIndexOf('-'));
}

/**
 * The composer's folder picker (`dh-picker`, spec 015, AC-16 to AC-18): the folder Claude will work in, by Q7's
 * rules until you pick one. Its menu lists Settings › Repositories' folders, then Add local folder, which opens
 * Settings' folder dialog and picks the folder it adds, and Manage folders. With no folders it opens the dialog.
 */
export function FolderPicker() {
  const repositories = useRepositories();
  const chips = useComposerStore((state) => state.chips);
  const picked = useComposerStore((state) => state.picked);
  const lastUsed = useComposerStore((state) => state.lastUsed);
  const pickFolder = useComposerStore((state) => state.pickFolder);
  const [adding, setAdding] = useState(false);
  // Add local folder opens the dialog once the menu has closed and let go of focus.
  const addAfterClose = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const ticketKey = chips.find((chip) => chip.kind === 'jira')?.key ?? null;

  if (repositories.data === undefined) {
    // As big as the picker, so the bar doesn't move when the folders arrive.
    return <Skeleton aria-hidden className="h-8 w-24 rounded-sm" />;
  }
  const folders = repositories.data.repositories;
  const shown = folderFor({ folders, picked, ticketKey, lastUsed });

  const dialog = (
    <FolderDialog
      task={adding ? { kind: 'add', jiraProject: projectOf(ticketKey) } : null}
      returnFocusTo={() => trigger.current}
      onClose={() => {
        setAdding(false);
      }}
      onSaved={(folder) => {
        setAdding(false);
        pickFolder(folder.id);
      }}
    />
  );

  if (shown.kind === 'none') {
    return (
      <>
        <Picker
          ref={trigger}
          icon={<Icon icon={Folder01Icon} aria-hidden />}
          onClick={() => {
            setAdding(true);
          }}
        >
          {words.none}
        </Picker>
        {dialog}
      </>
    );
  }

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Picker
            ref={trigger}
            icon={<Icon icon={Folder01Icon} aria-hidden />}
            aria-label={shown.kind === 'folder' ? words.name(shown.folder.name) : undefined}
          >
            {shown.kind === 'folder' ? shown.folder.name : words.choose}
          </Picker>
        </MenuTrigger>
        <MenuContent
          aria-label={words.menu}
          onCloseAutoFocus={(event) => {
            if (!addAfterClose.current) return;
            addAfterClose.current = false;
            event.preventDefault();
            setAdding(true);
          }}
        >
          <MenuLabel>{words.section}</MenuLabel>
          <MenuRadioGroup value={shown.kind === 'folder' ? shown.folder.id : ''} onValueChange={pickFolder}>
            {folders.map((folder) => (
              <MenuRadioItem
                key={folder.id}
                value={folder.id}
                icon={<Icon icon={Folder01Icon} />}
                path={folder.displayPath}
                textValue={folder.name}
              >
                {folder.name}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuItem
            icon={<Icon icon={PlusSignIcon} />}
            onSelect={() => {
              addAfterClose.current = true;
            }}
          >
            {words.add}
          </MenuItem>
          <MenuItem asChild>
            <Link to="/settings/$tab" params={{ tab: 'repositories' }}>
              <Icon icon={Settings02Icon} />
              {words.manage}
            </Link>
          </MenuItem>
        </MenuContent>
      </Menu>
      {dialog}
    </>
  );
}
