import { useRef } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { Button, Dialog, DialogContent, DialogTitle } from '@devhub/ui';

export interface DiscardSkillChangesProps {
  /** The open skill's Name, or "New skill". */
  name: string;
  /** Whether there is anything to lose: the editor's unsaved changes. */
  unsaved: () => boolean;
}

/**
 * Asks before unsaved changes to a skill are lost (AC-11). Every way out goes through the router (another skill and
 * New skill are addresses too), so one blocker covers them all: the list, New skill, another tab, the sidebar, Back.
 * Closing the window gets the browser's own question. Cancel has focus first and keeps you where you were.
 */
export function DiscardSkillChanges({ name, unsaved }: DiscardSkillChangesProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  const blocker = useBlocker({ shouldBlockFn: unsaved, enableBeforeUnload: unsaved, withResolver: true });
  const blocked = blocker.status === 'blocked';

  return (
    <Dialog
      open={blocked}
      onOpenChange={(open) => {
        if (!open && blocked) blocker.reset();
      }}
    >
      <DialogContent
        className="gap-4 p-6"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
      >
        <DialogTitle>{`Discard changes to ${name}?`}</DialogTitle>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            ref={cancel}
            variant="secondary"
            onClick={() => {
              if (blocked) blocker.reset();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (blocked) blocker.proceed();
            }}
          >
            Discard changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
