import { useId } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button, Dialog, DialogContent, DialogFoot, DialogTitle, Field, Input } from '@devhub/ui';
import { useChangeSession } from '../queries.ts';
import { renameSessionSchema, type RenameSessionValues } from '../schemas.ts';

export interface RenameSessionProps {
  session: { id: string; title: string };
  open: boolean;
  onClose: () => void;
  /** Where focus goes once it closes: the ⋯ or More actions that opened it. */
  returnFocusTo: () => HTMLElement | null;
}

/**
 * Rename session (spec 039, AC-28 to AC-30): one field, Name, holding the title, selected. A name of only spaces is
 * refused before anything is sent; a save that fails keeps the dialog open with your text. While a save is on its way
 * the dialog doesn't close.
 */
export function RenameSession({ session, open, onClose, returnFocusTo }: RenameSessionProps) {
  const change = useChangeSession();
  const titleId = useId();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || change.isPending) return;
        onClose();
        change.reset();
      }}
    >
      {open ? (
        <DialogContent
          size="narrow"
          aria-labelledby={titleId}
          onOpenAutoFocus={(event) => {
            // The name, selected, so typing replaces it and an arrow key keeps it.
            const input = (event.currentTarget as HTMLElement | null)?.querySelector('input');
            if (input === null || input === undefined) return;
            event.preventDefault();
            input.focus();
            input.select();
          }}
          onCloseAutoFocus={(event) => {
            const target = returnFocusTo();
            if (target === null) return;
            event.preventDefault();
            target.focus();
          }}
        >
          <RenameForm
            // A fresh form each time it opens, so a closed dialog never leaves its values behind.
            key={session.id}
            session={session}
            titleId={titleId}
            change={change}
            onDone={() => {
              onClose();
              change.reset();
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function RenameForm({
  session,
  titleId,
  change,
  onDone,
}: {
  session: { id: string; title: string };
  titleId: string;
  change: ReturnType<typeof useChangeSession>;
  onDone: () => void;
}) {
  const form = useForm<RenameSessionValues, unknown, z.output<typeof renameSessionSchema>>({
    resolver: zodResolver(renameSessionSchema),
    defaultValues: { title: session.title },
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit(({ title }) =>
    change.mutateAsync({ id: session.id, change: { title } }).then(
      onDone,
      // The form says the save failed; the dialog stays open with your text.
      () => undefined,
    ),
  );

  return (
    <form aria-labelledby={titleId} noValidate onSubmit={(event) => void submit(event)}>
      <div className="flex flex-col gap-4 p-6">
        <DialogTitle id={titleId}>Rename session</DialogTitle>
        <Field label="Name" error={errors.title?.message}>
          <Input autoComplete="off" {...form.register('title')} />
        </Field>
        {change.isError ? (
          <p role="alert" className="m-0 text-small text-danger">
            Couldn’t save the name. Try again.
          </p>
        ) : null}
      </div>
      <DialogFoot>
        <Button variant="secondary" disabled={change.isPending} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={change.isPending}>
          Save
        </Button>
      </DialogFoot>
    </form>
  );
}
