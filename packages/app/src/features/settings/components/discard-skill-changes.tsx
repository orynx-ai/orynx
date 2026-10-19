import { useRef } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { Button, Dialog, DialogContent, DialogTitle } from '@devhub/ui';

export interface DiscardSkillChangesProps {
  /** The open skill's Name, or "New skill". */
  name: string;
  /** Whether there is anything to lose: the editor's unsaved changes. */
  unsaved: () => boolean;
  /** Just before the way out goes on: what Try in a new session does once you discard (AC-23). */
  onDiscard?: () => void;
  /** When Cancel keeps you here. */
  onKeep?: () => void;
}

/**
 * Asks before unsaved changes to a skill are lost (AC-11). Every way out goes through the router (another skill and
 * New skill are addresses too), so one blocker covers them all: the list, New skill, another tab, the sidebar, Back.
 * Closing the window gets the browser's own question. Cancel has focus first and keeps you where you were.
 */
export function DiscardSkillChanges({ name, unsaved, onDiscard, onKeep }: DiscardSkillChangesProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  const blocker = useBlocker({ shouldBlockFn: unsaved, enableBeforeUnload: unsaved, withResolver: true });
  const blocked = blocker.status === 'blocked';

  return (
    <Dialog
      open={blocked}
      onOpenChange={(open) => {
        if (!open && blocked) {
          onKeep?.();
          blocker.reset();
        }
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
              if (!blocked) return;
              onKeep?.();
              blocker.reset();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (!blocked) return;
              onDiscard?.();
              blocker.proceed();
            }}
          >
            Discard changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
