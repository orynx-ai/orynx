import { useId } from 'react';
import { PlusSignIcon } from '@hugeicons/core-free-icons';
import type { OrynxTicketFields, TicketColumn } from '@devhub/contracts';
import { Button, Dialog, DialogContent, Icon, IconButton } from '@devhub/ui';
import { useCreateOrynxTicket } from '../queries.ts';
import { useTicketsStore } from '../store.ts';
import { orynxTicketWords as words } from '../ticket-words.ts';
import { TicketForm } from './ticket-form.tsx';

/** A new ticket's fields, as the server's own defaults: a Task of Medium priority, in `column` (AC-6). */
function newTicketFields(column: TicketColumn): OrynxTicketFields {
  return { title: '', description: '', type: 'Task', priority: 'Medium', status: column, dueDate: null };
}

/** New ticket in the page bar, or under an empty board (spec 037, AC-5, AC-6): a ticket that starts in To do. */
export function NewTicketButton({ size = 'sm' }: { size?: 'default' | 'sm' }) {
  const open = useTicketsStore((state) => state.openNewTicket);
  return (
    <Button
      size={size}
      onClick={() => {
        open('to_do');
      }}
    >
      <Icon icon={PlusSignIcon} aria-hidden />
      {words.newTicket}
    </Button>
  );
}

/** A column's +, as `tickets.html` draws it: a ticket that starts in that column (AC-8). */
export function NewTicketInColumn({ column }: { column: TicketColumn }) {
  const open = useTicketsStore((state) => state.openNewTicket);
  return (
    <IconButton
      variant="ghost"
      size="sm"
      label={words.newTicketIn(column)}
      onClick={() => {
        open(column);
      }}
    >
      <Icon icon={PlusSignIcon} aria-hidden />
    </IconButton>
  );
}

/**
 * The New ticket form in a dialog (spec 037, AC-6 to AC-12): Task, Medium and the column it was opened from by
 * default. It closes once the ticket is made, and focus goes back to the button that opened it; a save that fails
 * keeps it open with your values. While a save is on its way it doesn't close.
 */
export function NewTicketDialog() {
  const column = useTicketsStore((state) => state.newTicket);
  const close = useTicketsStore((state) => state.closeNewTicket);
  const create = useCreateOrynxTicket();
  const headingId = useId();

  return (
    <Dialog
      open={column !== null}
      onOpenChange={(open) => {
        if (open || create.isPending) return;
        close();
        create.reset();
      }}
    >
      {column === null ? null : (
        <DialogContent aria-labelledby={headingId}>
          <TicketForm
            // A fresh form each time it opens, so a closed dialog never leaves its values behind.
            key={column}
            heading={words.newTicket}
            headingId={headingId}
            defaults={newTicketFields(column)}
            submitLabel={words.create}
            saving={create.isPending}
            problem={create.isError ? words.saveFailed : null}
            onSubmit={(fields) =>
              create.mutateAsync(fields).then(
                () => {
                  close();
                  create.reset();
                },
                // The form says the save failed; the dialog stays open with your values.
                () => undefined,
              )
            }
            onCancel={() => {
              close();
              create.reset();
            }}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}
