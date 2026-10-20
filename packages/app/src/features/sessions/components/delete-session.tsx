import { useRef } from 'react';
import { useMatchRoute, useNavigate } from '@tanstack/react-router';
import { ApiRequestError } from '@devhub/api-client';
import type { SessionSummary } from '@devhub/contracts';
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
import { useDeleteSession, useHasChanges } from '../queries.ts';

export interface DeleteSessionProps {
  session: Pick<SessionSummary, 'id' | 'state'>;
  open: boolean;
  onClose: () => void;
  /** Where focus goes when you cancel: the ⋯ or More actions that opened it. */
  returnFocusTo: () => HTMLElement | null;
  /** Where focus goes once it's deleted, since its row and menu are gone. */
  onDeleted: () => void;
}

/**
 * Delete this session? (spec 039, Q1, AC-31 to AC-35): shadcn's AlertDialog, Cancel first, so Enter never deletes by
 * accident. It says when changes Claude made haven't been pushed. It stays open, waiting, until the delete is done; one
 * that fails says so and deletes nothing. Deleting the session you're looking at goes to the Sessions page.
 */
export function DeleteSession({ session, open, onClose, returnFocusTo, onDeleted }: DeleteSessionProps) {
  const remove = useDeleteSession();
  // Asked only while the dialog is open. Once a pull request is open, its changes went with it.
  const unpushed = useHasChanges(session.id, open) && session.state !== 'pr_open';
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const working = remove.error instanceof ApiRequestError && remove.error.code === 'session_working';
  const deleted = useRef(false);

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
            if (deleted.current) {
              event.preventDefault();
              onDeleted();
              return;
            }
            const target = returnFocusTo();
            if (target === null) return;
            event.preventDefault();
            target.focus();
          }}
        >
          <AlertDialogBody>
            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
            <AlertDialogDescription>
              Its worktree is deleted too. Its branch stays in your repository.
              {unpushed ? ' Its changes that haven’t been pushed will be lost.' : null}
            </AlertDialogDescription>
            {remove.isError ? (
              <p role="alert" className="m-0 text-small text-danger">
                {working ? 'Stop the session first.' : 'Couldn’t delete the session.'}
              </p>
            ) : null}
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              pending={remove.isPending}
              onClick={(event) => {
                // Open until the delete is done, so a failure still shows here.
                event.preventDefault();
                void remove.mutateAsync(session.id).then(
                  () => {
                    deleted.current = true;
                    onClose();
                    if (matchRoute({ to: '/sessions/$sessionId', params: { sessionId: session.id } }) !== false) {
                      void navigate({ to: '/sessions' });
                    }
                  },
                  // The dialog says the delete failed.
                  () => undefined,
                );
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
