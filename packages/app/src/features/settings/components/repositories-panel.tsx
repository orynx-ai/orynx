import { useEffect, useId, useRef, useState } from 'react';
import { PlusSignIcon } from '@hugeicons/core-free-icons';
import type { Repository } from '@devhub/contracts';
import { Button, Icon, EmptyState } from '@devhub/ui';
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
  // What the live region says since your last action: one line per removal the server agreed to.
  const [announcements, setAnnouncements] = useState<readonly string[]>([]);
  // Kept through a callback ref, so closing the form can hand focus back to it.
  const [addButton, setAddButton] = useState<HTMLButtonElement | null>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  // Each removal keeps its own outcome, so a second quick Remove can't swallow the first one's answer.
  const [removeFailed, setRemoveFailed] = useState(false);
  // A folder whose removal failed: its row comes back, and focus returns to its Remove once it has,
  // unless the person has moved on from where removing put focus.
  const [refocus, setRefocus] = useState<{ id: string; from: Element | null } | null>(null);
  const formId = useId();

  useEffect(() => {
    if (refocus === null) return;
    const button = removeButtons.current.get(refocus.id);
    if (button === undefined) return;
    const focused = document.activeElement;
    if (focused === refocus.from || focused === null || focused === document.body) button.focus();
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
    const target = next === undefined ? addButton : (removeButtons.current.get(next.id) ?? null);
    target?.focus();
    setAnnouncements([]);
    setRemoveFailed(false);
    remove.mutateAsync(folder.id).then(
      () => {
        // Added to what's there, not in place of it: two answers that land together must both be said.
        setAnnouncements((said) => [...said, `Removed ${folder.name}.`]);
      },
      () => {
        setRemoveFailed(true);
        setRefocus({ id: folder.id, from: target });
      },
    );
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
            setAnnouncements([]);
            setFormOpen((open) => !open);
          }}
        >
          <Icon icon={PlusSignIcon} aria-hidden />
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
      {removeFailed ? <SaveError /> : null}
      {/* Not atomic, so a screen reader reads each new line rather than everything again. */}
      <div role="status" aria-atomic="false" className="sr-only">
        {announcements.map((line, index) => (
          // The lines only grow until the next action empties them, so the index names each one.
          <p key={index} className="m-0">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
