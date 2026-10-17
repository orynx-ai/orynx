import type { Ref } from 'react';
import { Folder } from 'lucide-react';
import type { Repository } from '@devhub/contracts';
import { Button, Pill } from '@devhub/ui';

export interface RepositoryRowProps {
  folder: Repository;
  onRemove: () => void;
  /** The Remove button, so the panel can move focus to it when the row above goes. */
  removeRef?: Ref<HTMLButtonElement>;
}

/**
 * One folder in Settings › Repositories: its name, its path with `~`, its Jira project and Remove. The
 * name is never cut off; on a narrow row the path wraps under it.
 */
export function RepositoryRow({ folder, onRemove, removeRef }: RepositoryRowProps) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <span className="flex min-w-0 items-center gap-2 font-medium wrap-anywhere sm:min-w-25">
        <Folder aria-hidden className="text-muted-foreground" />
        {folder.name}
      </span>
      <span className="min-w-0 grow basis-50 font-mono text-code wrap-anywhere text-muted-foreground">
        {folder.displayPath}
      </span>
      {folder.jiraProject === null ? null : <Pill plain>Jira {folder.jiraProject}</Pill>}
      <Button
        ref={removeRef}
        variant="ghost"
        size="sm"
        aria-label={`Remove ${folder.name}`}
        // Removing moves focus to the next row's Remove, so a held-down Enter would remove one after another.
        onKeyDown={(event) => {
          if (event.repeat) event.preventDefault();
        }}
        onClick={onRemove}
      >
        Remove
      </Button>
    </li>
  );
}
