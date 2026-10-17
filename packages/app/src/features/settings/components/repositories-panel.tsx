import { useEffect, useId, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Repository } from '@devhub/contracts';
import { Button, EmptyState } from '@devhub/ui';
import { useAddingRepository, useRemoveRepository, useRepositories } from '../queries.ts';
import { AddFolderForm } from './add-folder-form.tsx';
import { RepositoryRow } from './repository-row.tsx';
import { SaveError } from './save-error.tsx';
import { ServerUnreachable } from './server-unreachable.tsx';

/**
 * Settings › Repositories: the folders on this computer Claude may work in, each with the Jira project
 * its tickets belong to (spec 005). To change a folder's project, remove it and add it again (Q9).
 */
export function RepositoriesPanel() {
  const repositories = useRepositories();
  const remove = useRemoveRepository();
  const adding = useAddingRepository();
  const [formOpen, setFormOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  // Kept through a callback ref, so closing the form can hand focus back to it.
  const [addButton, setAddButton] = useState<HTMLButtonElement | null>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  // A folder whose removal failed: its row comes back, and focus returns to its Remove once it has.
  const [refocus, setRefocus] = useState<string | null>(null);
  const formId = useId();

  useEffect(() => {
    if (refocus === null) return;
    const button = removeButtons.current.get(refocus);
    if (button === undefined) return;
    button.focus();
    setRefocus(null);
  }, [refocus, repositories.data]);

  if (repositories.data === undefined && repositories.isError) return <ServerUnreachable />;
  const folders = repositories.data?.repositories;

  function closeForm() {
    setFormOpen(false);
    addButton?.focus();
  }

  function removeFolder(folder: Repository, next: Repository | undefined) {
    // Focus moves on before the row goes, so it never falls back to the page.
    (next === undefined ? addButton : removeButtons.current.get(next.id))?.focus();
    setAnnouncement('');
    remove.mutate(folder.id, {
      onSuccess: () => {
        setAnnouncement(`Removed ${folder.name}.`);
      },
      onError: () => {
        setRefocus(folder.id);
      },
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="m-0 min-w-0 flex-1 text-small text-muted-foreground">
          Folders on this computer that Claude can work in
        </p>
        <Button
          ref={setAddButton}
          variant="secondary"
          size="sm"
          aria-expanded={formOpen}
          aria-controls={formOpen ? formId : undefined}
          // While a folder is on its way, closing the form would hide the server's answer.
          aria-disabled={adding || undefined}
          onClick={() => {
            if (adding) return;
            setAnnouncement('');
            setFormOpen((open) => !open);
          }}
        >
          <Plus aria-hidden />
          Add local folder
        </Button>
      </div>
      {formOpen ? <AddFolderForm id={formId} onAdded={closeForm} onCancel={closeForm} /> : null}
      {folders === undefined ? (
        // While the folders load: the list's frame, one row tall, so the tab doesn't open on a blank.
        <div aria-hidden className="h-14 rounded-md border border-border bg-raised" />
      ) : folders.length === 0 ? (
        <EmptyState title="No folders yet">
          <span>Add a folder so Claude can work on its code.</span>
        </EmptyState>
      ) : (
        <ul
          aria-label="Folders"
          className="m-0 list-none divide-y divide-border rounded-md border border-border bg-raised p-0"
        >
          {folders.map((folder, index) => (
            <RepositoryRow
              key={folder.id}
              folder={folder}
              removeRef={(element) => {
                if (element === null) removeButtons.current.delete(folder.id);
                else removeButtons.current.set(folder.id, element);
              }}
              onRemove={() => {
                removeFolder(folder, folders[index + 1]);
              }}
            />
          ))}
        </ul>
      )}
      {remove.isError ? <SaveError /> : null}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
