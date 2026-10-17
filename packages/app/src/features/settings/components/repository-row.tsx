import type { Ref } from 'react';
import type { Repository } from '@devhub/contracts';
import { Button, Pill } from '@devhub/ui';

export interface RepositoryRowProps {
  folder: Repository;
  onRemove: () => void;
  /** The Remove button, so the panel can move focus to it when the row above goes. */
  removeRef?: Ref<HTMLButtonElement>;
}

/**
 * One folder in Settings › Repositories: its name, its path with `~`, its Jira project and Remove. On a
 * narrow row the path wraps under the name.
 */
export function RepositoryRow({ folder, onRemove, removeRef }: RepositoryRowProps) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      {/* The design's 100 px name column; on a phone the name has the line to itself. */}
      <span className="max-w-full truncate font-medium sm:w-25" title={folder.name}>
        {folder.name}
      </span>
      <span className="min-w-0 grow basis-50 font-mono text-small break-all text-muted-foreground">
        {folder.displayPath}
      </span>
      {folder.jiraProject === null ? null : <Pill plain>Jira {folder.jiraProject}</Pill>}
      <Button ref={removeRef} variant="ghost" size="sm" aria-label={`Remove ${folder.name}`} onClick={onRemove}>
        Remove
      </Button>
    </li>
  );
}
