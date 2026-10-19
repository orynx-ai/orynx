import { useId, useRef, useState } from 'react';
import type { SkillFolder } from '@devhub/contracts';
import { Button, Dialog, DialogContent, DialogTitle, DialogTrigger } from '@devhub/ui';
import { useRemoveSkill } from '../queries.ts';

export interface DeleteSkillProps {
  folder: SkillFolder;
  /** The skill's Name, or its folder when Orynx can't read it. */
  name: string;
  pluginFolder: string;
  /** Once the folder is gone. */
  onDeleted: () => void;
}

/**
 * Delete skill (AC-10): the quiet danger button at the editor's start, and its confirm step in the page, never the
 * browser's. Cancel has focus first, so Enter never deletes by accident, and gives focus back to Delete skill.
 */
export function DeleteSkill({ folder, name, pluginFolder, onDeleted }: DeleteSkillProps) {
  const [open, setOpen] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const describedBy = useId();
  const remove = useRemoveSkill();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) remove.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="danger-ghost" size="sm">
          Delete skill
        </Button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={describedBy}
        className="gap-4 p-6"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
      >
        <DialogTitle>{`Delete ${name}?`}</DialogTitle>
        <p id={describedBy} className="m-0 text-muted-foreground">
          {`Orynx deletes ${pluginFolder}/skills/${folder}. Sessions that used it keep what they were sent.`}
        </p>
        {remove.isError ? (
          <p role="alert" className="m-0 text-small text-danger">
            The skill wasn&apos;t deleted. Try again.
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
            pending={remove.isPending}
            onClick={() => {
              remove.mutate(folder, {
                onSuccess: () => {
                  setOpen(false);
                  onDeleted();
                },
              });
            }}
          >
            Delete skill
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
