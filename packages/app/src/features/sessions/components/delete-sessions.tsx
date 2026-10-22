import { useRef } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@devhub/ui';
import { plural } from '../../../words/calendar.ts';
import { useDeleteSessions } from '../queries.ts';

export interface DeleteSessionsProps {
  ids: readonly string[];
  open: boolean;
  onClose: () => void;
  /** The sessions that went, once the deletes are done; called before it closes, or with the failure showing. */
  onDeleted: (ids: readonly string[]) => void;
  /** Where focus goes once they're all deleted, since the button that opened it is gone. */
  afterDelete: () => void;
}

/**
 * Delete N sessions? (the user's call, 22 Oct 2026): the Sessions page's Select, confirmed once, as Delete this session?
 * is (spec 039). Each session's worktree goes and its branch stays. It stays open, waiting, until every delete is done;
 * when some fail it says how many, and those stay picked.
 */
export function DeleteSessions({ ids, open, onClose, onDeleted, afterDelete }: DeleteSessionsProps) {
  const remove = useDeleteSessions();
  const deleted = useRef(false);
  const failed = remove.data === undefined ? 0 : ids.length;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next || remove.isPending) return;
        onClose();
        remove.reset();
      }}
    >
      {open ? (
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            if (!deleted.current) return;
            deleted.current = false;
            event.preventDefault();
            afterDelete();
          }}
        >
          <AlertDialogBody>
            <AlertDialogTitle>Delete {plural(ids.length, 'session')}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their worktrees are deleted too, with any changes that haven’t been pushed. Their branches stay.
            </AlertDialogDescription>
            {failed > 0 ? (
              <p role="alert" className="m-0 text-small text-danger">
                Couldn’t delete {plural(failed, 'session')}.
              </p>
            ) : null}
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              pending={remove.isPending}
              onClick={(event) => {
                // Open until every delete is done, so a failure still shows here.
                event.preventDefault();
                void remove.mutateAsync(ids).then((gone) => {
                  onDeleted(gone);
                  if (gone.length < ids.length) return;
                  deleted.current = true;
                  onClose();
                  remove.reset();
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
}
