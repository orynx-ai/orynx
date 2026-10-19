import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { Session } from '@devhub/contracts';
import { Button, Dialog, DialogContent, DialogTitle, DialogTrigger } from '@devhub/ui';
import { useApi } from '../../../api.tsx';
import { discardKeepsPullRequest } from '../pull-request-words.ts';

/**
 * Discard changes (AC-10): the quiet danger button `session.html` draws, in the title row (the user's call, 19 Oct
 * 2026), and its confirm step in the page, never the browser's. Cancel has focus first, so
 * Enter never deletes by accident. Once the session says its changes are gone, the button goes and the
 * title takes focus.
 */
export function DiscardSession({ session, title }: { session: Session; title: RefObject<HTMLHeadingElement | null> }) {
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
  const discarded = session.discardedAt !== null;

  useEffect(() => {
    if (discard.isSuccess && discarded) title.current?.focus();
  }, [discard.isSuccess, discarded, title]);

  // Nothing to discard once it's gone, or before a worktree was made.
  if (discarded || session.branch === null) return null;

  return (
    <div className="flex">
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) discard.reset();
        }}
      >
        <DialogTrigger asChild>
          <Button variant="danger-ghost">Discard changes</Button>
        </DialogTrigger>
        <DialogContent
          aria-describedby={describedBy}
          className="gap-4 p-6"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancel.current?.focus();
          }}
        >
          <DialogTitle>Discard Claude&apos;s changes?</DialogTitle>
          <p id={describedBy} className="m-0 text-muted-foreground">
            This deletes the worktree and the branch {session.branch}. The changes can&apos;t be brought back.
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
    </div>
  );
}
