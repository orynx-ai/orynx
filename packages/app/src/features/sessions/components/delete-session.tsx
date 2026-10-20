import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
  Checkbox,
} from '@devhub/ui';
import { deleteKeepsPullRequest } from '../pull-request-words.ts';
import { useDeleteSession, useHasChanges, useSession } from '../queries.ts';

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
 * accident. It is the one way to let a session go, since it took Discard changes' place (the user's call, 20 Oct
 * 2026): the session and its worktree go, and the branch too when you tick it; your own pull request's branch is never
 * offered (spec 031). It says when changes Claude made haven't been pushed. It stays open, waiting, until the delete is
 * done; one that fails says so and deletes nothing. Deleting the session you're looking at goes to the Sessions page.
 */
export function DeleteSession({ session, open, onClose, returnFocusTo, onDeleted }: DeleteSessionProps) {
  const remove = useDeleteSession();
  // Asked only while the dialog is open: its branch, and whether there's anything Claude changed.
  const detail = useSession(session.id, open).data ?? null;
  // Once a pull request is open, its changes went with it.
  const unpushed = useHasChanges(session.id, open) && session.state !== 'pr_open';
  const branch =
    detail !== null && detail.workOn !== 'pull_request' && detail.discardedAt === null ? detail.branch : null;
  const form = useForm<{ branch: boolean }>({ defaultValues: { branch: false } });
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
        form.reset();
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
              Its worktree is deleted too.
              {unpushed ? ' Its changes that haven’t been pushed will be lost.' : null}
              {/* Delete takes only what's on this computer (spec 014, AC-18). */}
              {detail?.pullRequest == null ? null : ` ${deleteKeepsPullRequest(detail.pullRequest.number)}`}
            </AlertDialogDescription>
            {branch === null ? null : (
              <Controller
                control={form.control}
                name="branch"
                render={({ field }) => (
                  <Checkbox
                    label={
                      <>
                        Also delete the branch <span className="font-mono text-code">{branch}</span>
                      </>
                    }
                    className="min-h-10 py-2"
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked === true);
                    }}
                  />
                )}
              />
            )}
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
                void remove.mutateAsync({ id: session.id, branch: branch !== null && form.getValues('branch') }).then(
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
