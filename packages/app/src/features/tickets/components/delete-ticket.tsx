import { Delete02Icon } from '@hugeicons/core-free-icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Icon,
} from '@devhub/ui';
import { useState } from 'react';
import { useDeleteOrynxTicket } from '../queries.ts';
import { orynxTicketWords as words } from '../ticket-words.ts';

/**
 * Delete ticket (spec 037, AC-17, AC-18): the quiet danger button at the start of an Orynx ticket's actions, and its
 * confirmation, shadcn's AlertDialog: Cancel has focus first, so Enter never deletes by accident. It stays open,
 * waiting, until the delete is done; a delete that fails says so and deletes nothing.
 */
export function DeleteTicket({ ticketKey, onDeleted }: { ticketKey: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const remove = useDeleteOrynxTicket();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (remove.isPending) return;
        setOpen(next);
        remove.reset();
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="danger-ghost">
          <Icon icon={Delete02Icon} aria-hidden />
          {words.deleteTicket}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogBody>
          <AlertDialogTitle>{words.deleteTitle(ticketKey)}</AlertDialogTitle>
          <AlertDialogDescription>{words.deleteLine}</AlertDialogDescription>
          {remove.isError ? (
            <p role="alert" className="m-0 text-small text-danger">
              {words.deleteFailed}
            </p>
          ) : null}
        </AlertDialogBody>
        <AlertDialogFooter>
          <AlertDialogCancel>{words.cancel}</AlertDialogCancel>
          <AlertDialogAction
            pending={remove.isPending}
            onClick={(event) => {
              // Open until the delete is done, so a failure still shows here.
              event.preventDefault();
              remove.mutate(ticketKey, {
                onSuccess: () => {
                  setOpen(false);
                  onDeleted();
                },
              });
            }}
          >
            {words.deleteTicket}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
