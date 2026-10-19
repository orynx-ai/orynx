import { useId, type SubmitEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button, Dialog, DialogContent, DialogTitle, Field, Input } from '@devhub/ui';
import { addFileWords as words } from '../composer-words.ts';
import { useCheckFile } from '../queries.ts';
import { addFileFormSchema, type AddFileFormValues } from '../schemas.ts';

export interface AddFileDialogProps {
  open: boolean;
  /** Why it opened: the server's line that no picker can open here. */
  reason: string;
  onClose: () => void;
  /** The file the server found, with `~`; the dialog has closed. */
  onAdded: (path: string) => void;
  /** Where focus goes once it has closed, added or not: the composer's box. */
  returnFocusTo: () => HTMLElement | null;
}

/**
 * Add a file (spec 022, AC-12): when no file picker can open on this computer, a typed path, which the server
 * checks is a file Claude can read before it becomes a chip. Its buttons sit at its end, Cancel first.
 */
export function AddFileDialog({ open, reason, onClose, onAdded, returnFocusTo }: AddFileDialogProps) {
  const describedBy = useId();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {open ? (
        <DialogContent
          aria-describedby={describedBy}
          className="gap-4 p-6"
          onCloseAutoFocus={(event) => {
            const target = returnFocusTo();
            if (target === null) return;
            event.preventDefault();
            target.focus();
          }}
        >
          <DialogTitle>{words.title}</DialogTitle>
          <p id={describedBy} className="m-0 text-muted-foreground">
            {reason}
          </p>
          <AddFileForm onCancel={onClose} onAdded={onAdded} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function AddFileForm({ onCancel, onAdded }: { onCancel: () => void; onAdded: (path: string) => void }) {
  const check = useCheckFile();
  const form = useForm<AddFileFormValues, unknown, { path: string }>({
    resolver: zodResolver(addFileFormSchema),
    defaultValues: { path: '' },
  });
  const { errors } = form.formState;

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    // The dialog sits inside the composer in React's tree, so its submit would reach the composer's form too.
    event.stopPropagation();
    void form.handleSubmit(({ path }) => {
      check.mutate(
        { path },
        {
          onSuccess: (answer) => {
            if (answer.result === 'found') onAdded(answer.path);
            else form.setError('path', { message: words.notFound(path) }, { shouldFocus: true });
          },
        },
      );
    })(event);
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <Field label={words.path} help={words.help} error={errors.path?.message ?? check.error?.message}>
        <Input
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          {...form.register('path')}
        />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {words.cancel}
        </Button>
        <Button type="submit" pending={check.isPending}>
          {words.add}
        </Button>
      </div>
    </form>
  );
}
