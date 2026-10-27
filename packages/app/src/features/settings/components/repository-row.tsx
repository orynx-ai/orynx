import { useRef, type Ref } from 'react';
import { Copy01Icon, Delete02Icon, Folder01Icon, MoreVerticalIcon, PencilEdit02Icon } from '@hugeicons/core-free-icons';
import type { Repository } from '@devhub/contracts';
import { Icon, IconButton, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Pill } from '@devhub/ui';

export interface RepositoryRowProps {
  folder: Repository;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** The More actions button, so the panel can move focus to it. */
  moreRef?: Ref<HTMLButtonElement>;
}

/**
 * One folder in Settings › Repositories: its name, its path with `~`, Folder not found when it's gone (spec 048), its
 * Jira project, and More actions (spec 020): Edit, Duplicate and Delete. The name is never cut off; on a narrow row the
 * path wraps under it.
 */
export function RepositoryRow({ folder, onEdit, onDuplicate, onDelete, moreRef }: RepositoryRowProps) {
  // The action picked runs once the menu has closed and let go of focus (it keeps focus inside while
  // open); the panel then moves focus itself: into the dialog, or on to the next row.
  const picked = useRef<(() => void) | null>(null);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <span className="flex min-w-0 items-center gap-2 font-medium wrap-anywhere sm:min-w-25">
        <Icon icon={Folder01Icon} aria-hidden className="text-muted-foreground" />
        {folder.name}
      </span>
      <span className="min-w-0 grow basis-50 font-mono text-code wrap-anywhere text-muted-foreground">
        {folder.displayPath}
      </span>
      {folder.found ? null : <Pill tone="warning">Folder not found</Pill>}
      {folder.jiraProject === null ? null : <Pill plain>Jira {folder.jiraProject}</Pill>}
      <Menu>
        <MenuTrigger asChild>
          <IconButton
            ref={moreRef}
            variant="ghost"
            size="sm"
            // At the row's end even when a narrow window wraps it onto a line of its own.
            className="ms-auto"
            label="More actions"
            aria-label={`More actions for ${folder.name}`}
          >
            <Icon icon={MoreVerticalIcon} aria-hidden />
          </IconButton>
        </MenuTrigger>
        <MenuContent
          align="end"
          aria-label={`Actions for ${folder.name}`}
          onCloseAutoFocus={(event) => {
            const action = picked.current;
            if (action === null) return;
            picked.current = null;
            event.preventDefault();
            action();
          }}
        >
          <MenuItem
            icon={<Icon icon={PencilEdit02Icon} />}
            onSelect={() => {
              picked.current = onEdit;
            }}
          >
            Edit
          </MenuItem>
          <MenuItem
            icon={<Icon icon={Copy01Icon} />}
            onSelect={() => {
              picked.current = onDuplicate;
            }}
          >
            Duplicate
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            icon={<Icon icon={Delete02Icon} />}
            description="The folder stays on disk."
            className="text-danger"
            onSelect={() => {
              picked.current = onDelete;
            }}
          >
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    </li>
  );
}
