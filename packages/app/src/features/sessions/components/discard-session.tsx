import { useId, useImperativeHandle, useRef, useState, type Ref, type RefObject } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { Session } from '@devhub/contracts';
import { Button, Dialog, DialogContent, DialogTitle } from '@devhub/ui';
import { useApi } from '../../../api.tsx';
import { discardKeepsPullRequest } from '../pull-request-words.ts';

/**
 * Discard changes (AC-10): its confirm step, in the page, never the browser's, opened from the page bar's More
 * actions (the user's call, 19 Oct 2026). Cancel has focus first, so Enter never deletes by accident. Cancel or
 * Esc gives focus back to More actions; once the changes are gone, the title takes it.
 */
export function DiscardSession({
  session,
  title,
  menu,
  ref,
}: {
  session: Session;
  title: RefObject<HTMLHeadingElement | null>;
  /** More actions, where focus goes back when the dialog closes without discarding. */
  menu: RefObject<HTMLElement | null>;
  /** Opens the dialog, for the menu's item. */
  ref: Ref<{ open: () => void }>;
}) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const describedBy = useId();
  const discard = useMutation({
    mutationFn: () => api.discardSession(session.id),
    onSuccess: () => {
      setOpen(false);
    },
  });
  useImperativeHandle(ref, () => ({
    open: () => {
      setOpen(true);
    },
  }));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) discard.reset();
      }}
    >
      <DialogContent
        aria-describedby={describedBy}
        className="gap-4 p-6"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          // More actions may be gone with the changes, so a discard hands focus to the title.
          (discard.isSuccess ? title : menu).current?.focus();
        }}
      >
        <DialogTitle>Discard Claude&apos;s changes?</DialogTitle>
        <p id={describedBy} className="m-0 text-muted-foreground">
          {/* Your pull request's branch isn't the session's to delete (spec 031). */}
          {session.workOn === 'pull_request'
            ? 'This deletes the worktree.'
            : `This deletes the worktree and the branch ${session.branch ?? ''}.`}{' '}
          The changes can&apos;t be brought back.
          {/* Discard deletes only what's on this computer (spec 014, AC-18). */}
          {session.pullRequest === null ? null : ` ${discardKeepsPullRequest(session.pullRequest.number)}`}
        </p>
        {discard.isError ? (
          <p role="alert" className="m-0 text-small text-danger">
            Couldn&apos;t discard the changes.
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            ref={cancel}
            variant="secondary"
            onClick={() => {
              setOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            pending={discard.isPending}
            onClick={() => {
              discard.mutate();
            }}
          >
            Discard changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
