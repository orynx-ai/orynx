import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PlusSignIcon } from '@hugeicons/core-free-icons';
import type { Repository } from '@devhub/contracts';
import { Button, Icon, EmptyState } from '@devhub/ui';
import { useRemoveRepository, useRepositories } from '../queries.ts';
import { FolderDialog, type FolderTask } from './folder-dialog.tsx';
import { RepositoryRow } from './repository-row.tsx';
import { SaveError } from './save-error.tsx';
import { ServerUnreachable } from './server-unreachable.tsx';

/** One sentence for the live region; an object, so two equal sentences stay apart. */
interface Sentence {
  text: string;
}

/**
 * Settings › Repositories: the folders on this computer Claude may work in, each with the Jira project
 * its tickets belong to (spec 005). Add local folder, and each folder's Edit and Duplicate, open the folder
 * dialog; Delete forgets a folder at once (spec 020).
 */
export function RepositoriesPanel() {
  const repositories = useRepositories();
  const remove = useRemoveRepository();
  const [task, setTask] = useState<FolderTask | null>(null);
  // What the live region says. A sentence leaves only once it has been on screen, so answers that land
  // together, or one that lands as the next Remove is pressed, are all heard.
  const [sentences, setSentences] = useState<readonly Sentence[]>([]);
  const shown = useRef<readonly Sentence[]>([]);
  // Kept through a callback ref, so closing the form can hand focus back to it.
  const [addButton, setAddButton] = useState<HTMLButtonElement | null>(null);
  const moreButtons = useRef(new Map<string, HTMLButtonElement>());
  // Each removal keeps its own outcome, so a second quick Remove can't swallow the first one's answer.
  const [removeFailed, setRemoveFailed] = useState(false);
  // A folder whose removal failed: its row comes back, and focus returns to its More actions once it has,
  // unless the person has moved on from where removing put focus.
  const [refocus, setRefocus] = useState<{ id: string; from: Element | null } | null>(null);

  useLayoutEffect(() => {
    shown.current = sentences;
  }, [sentences]);

  useEffect(() => {
    if (refocus === null) return;
    const button = moreButtons.current.get(refocus.id);
    if (button === undefined) return;
    const focused = document.activeElement;
    if (focused === refocus.from || focused === null || focused === document.body) button.focus();
    setRefocus(null);
  }, [refocus, repositories.data]);

  if (repositories.data === undefined && repositories.isError) return <ServerUnreachable />;
  const folders = repositories.data?.repositories;

  function unshown(list: readonly Sentence[]) {
    return list.filter((sentence) => !shown.current.includes(sentence));
  }

  function announce(text: string) {
    setSentences((list) => [...unshown(list), { text }]);
  }

  /** Where focus goes when the dialog closes: back to what opened it. */
  function opener(): HTMLElement | null {
    if (task === null || task.kind === 'add') return addButton;
    return moreButtons.current.get(task.folder.id) ?? addButton;
  }

  function removeFolder(folder: Repository, next: Repository | undefined) {
    // Focus moves on before the row goes, so it never falls back to the page.
    const target = next === undefined ? addButton : (moreButtons.current.get(next.id) ?? null);
    target?.focus();
    setSentences(unshown);
    setRemoveFailed(false);
    remove.mutateAsync(folder.id).then(
      () => {
        announce(`Removed ${folder.name}.`);
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
          aria-haspopup="dialog"
          onClick={() => {
            setSentences(unshown);
            setTask({ kind: 'add' });
          }}
        >
          <Icon icon={PlusSignIcon} aria-hidden />
          Add local folder
        </Button>
      </div>
      <FolderDialog
        task={task}
        returnFocusTo={opener}
        onClose={() => {
          setTask(null);
        }}
        onSaved={() => {
          setTask(null);
        }}
      />
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
              moreRef={(element) => {
                if (element === null) moreButtons.current.delete(folder.id);
                else moreButtons.current.set(folder.id, element);
              }}
              onEdit={() => {
                setTask({ kind: 'edit', folder });
              }}
              onDuplicate={() => {
                setTask({ kind: 'duplicate', folder });
              }}
              onDelete={() => {
                removeFolder(folder, folders[index + 1]);
              }}
            />
          ))}
        </ul>
      )}
      {removeFailed ? <SaveError /> : null}
      <p role="status" className="sr-only">
        {sentences.map((sentence) => sentence.text).join(' ')}
      </p>
    </div>
  );
}
