import { Fragment, useRef, useState } from 'react';
import { ArrowDown01Icon, Cancel01Icon, Delete02Icon, MoveToIcon, SparklesIcon } from '@hugeicons/core-free-icons';
import { isOrynxKey, type TicketColumn } from '@devhub/contracts';
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
  FloatingBar,
  FloatingBarSeparator,
  Icon,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  StatusIcon,
  WorkItemShip,
} from '@devhub/ui';
import { useNewTask } from '../../../shell/use-shortcuts.ts';
import { useWide } from '../../../shell/use-wide.ts';
import { useComposerStore } from '../../home/store.ts';
import { useDeleteOrynxTickets, useMoveOrynxTickets, useTickets } from '../queries.ts';
import { useTicketsStore } from '../store.ts';
import { columnNames, columnOrder, selectionWords } from '../ticket-words.ts';
import { statusIcons } from './tickets-board.tsx';

/**
 * Ship on a Tickets card or list row (spec 020's name for starting Claude on a ticket). Since spec 022 it starts
 * nothing: it adds the ticket after the chips already in Home's composer and opens Home with focus in the box, so
 * you can say what you want and add context first (Q13). The composer's folder picker picks the folder.
 */
export function ShipButton({ ticketKey, look }: { ticketKey: string; look: 'sparkle' | 'button' }) {
  const addChip = useComposerStore((state) => state.addChip);
  const newTask = useNewTask();
  const ship = () => {
    addChip({ kind: 'jira', key: ticketKey });
    newTask();
  };
  if (look === 'sparkle') return <WorkItemShip itemKey={ticketKey} onClick={ship} />;
  return (
    <Button variant="ghost" size="sm" aria-label={`Ship ${ticketKey}`} onClick={ship}>
      Ship
    </Button>
  );
}

/**
 * Where the ticked tickets can all move on to (the user's call, 20 Oct 2026): every column after the furthest one's,
 * so all To do offers In progress, In review and Done, and anything In review offers Done alone. Only Orynx's own
 * tickets move here, and only when Tickets has them all: Jira's change in Jira.
 */
export function movesFor(keys: readonly string[], columns: ReadonlyMap<string, TicketColumn>): TicketColumn[] {
  if (!keys.every(isOrynxKey)) return [];
  const at = keys.flatMap((key) => columns.get(key) ?? []);
  if (at.length < keys.length) return [];
  const furthest = Math.max(...at.map((column) => columnOrder.indexOf(column)));
  return columnOrder.slice(furthest + 1);
}

/**
 * The tickets ticked, in a bar floating at the bottom of the page: how many, Unselect all and Ship all (the user's
 * call, 19 Oct 2026). Ship all does what one ticket's Ship does, for all of them in the order ticked, so Send starts
 * one session with every ticket, the first its own (spec 022, Q2). With only Orynx tickets ticked, Delete all and Move
 * to come before Ship all (the user's call, 20 Oct 2026). Unselect all, a move and a delete put focus where `onCleared`
 * says, since the bar goes. Put it at the end of the page body: it keeps room there so the bar never hides the last
 * ticket.
 */
export function ShipSelected({ onCleared }: { onCleared: () => void }) {
  const selected = useTicketsStore((state) => state.selected);
  const clear = useTicketsStore((state) => state.clearSelected);
  const addChip = useComposerStore((state) => state.addChip);
  const newTask = useNewTask();
  const tickets = useTickets().data?.tickets;
  const move = useMoveOrynxTickets();
  const wide = useWide();
  if (selected.length === 0) return null;
  const done = () => {
    clear();
    onCleared();
  };
  const moves = movesFor(selected, new Map(tickets?.map((ticket) => [ticket.key, ticket.column])));
  const orynx = selected.every(isOrynxKey);
  // The bar's icons at 16 px, beside its 14 px words (the user's call, 20 Oct 2026).
  const unselect = (
    <IconButton
      variant="ghost"
      size="sm"
      label={selectionWords.clear}
      onClick={() => {
        move.reset();
        done();
      }}
    >
      <Icon icon={Cancel01Icon} aria-hidden className="size-4" />
    </IconButton>
  );
  const remove = orynx ? <DeleteSelected keys={selected} onDeleted={clear} focusAfter={onCleared} /> : null;
  // Under 768 px Move to and Ship all are icons too, so the bar fits a phone.
  const moveTo =
    moves.length === 0 ? null : (
      <Menu>
        <MenuTrigger asChild>
          {wide ? (
            // No `pending`: it keeps a spinner's room, and a move here takes a moment at most.
            <Button variant="ghost" size="sm">
              {selectionWords.moveTo}
              <Icon icon={ArrowDown01Icon} aria-hidden className="size-4" />
            </Button>
          ) : (
            <IconButton variant="ghost" size="sm" label={selectionWords.moveTo} pending={move.isPending}>
              <Icon icon={MoveToIcon} aria-hidden className="size-4" />
            </IconButton>
          )}
        </MenuTrigger>
        <MenuContent size="sm" align="center" side="top" aria-label={selectionWords.moveTo}>
          {moves.map((column) => (
            <MenuItem
              key={column}
              icon={<StatusIcon status={statusIcons[column]} />}
              onSelect={() => {
                // After the menu has closed and given focus back, so `onCleared` has the last word.
                void move.mutateAsync({ keys: selected, status: column }).then(done, () => undefined);
              }}
            >
              {columnNames[column]}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
    );
  const shipAll = () => {
    for (const key of selected) addChip({ kind: 'jira', key });
    clear();
    newTask();
  };
  const sparkles = <Icon icon={SparklesIcon} aria-hidden className="size-4" />;
  const ship = wide ? (
    <Button variant="ghost" size="sm" onClick={shipAll}>
      {selectionWords.ship}
      {sparkles}
    </Button>
  ) : (
    <IconButton variant="ghost" size="sm" label={selectionWords.ship} onClick={shipAll}>
      {sparkles}
    </IconButton>
  );
  // A hairline between every two actions (the user's call, 20 Oct 2026).
  const actions = Object.entries({ unselect, remove, moveTo, ship }).filter(([, action]) => action !== null);
  return (
    <>
      {/* With the page's own 32 px below, room for the 46 px bar and its 16 px from the window's bottom. */}
      <div aria-hidden className="h-4 shrink-0" />
      <FloatingBar aria-label={selectionWords.bar}>
        <span role="status" className="text-small whitespace-nowrap text-muted-foreground">
          {move.isError ? selectionWords.moveFailed : selectionWords.count(selected.length)}
        </span>
        {actions.map(([name, action], index) => (
          <Fragment key={name}>
            {index === 0 ? null : <FloatingBarSeparator />}
            {action}
          </Fragment>
        ))}
      </FloatingBar>
    </>
  );
}

/**
 * Delete all, for Orynx tickets alone, and its confirmation, as one ticket's Delete has (spec 037, AC-17): Cancel has
 * focus first, and it stays open until every delete is done, so a failure still shows there.
 */
function DeleteSelected({
  keys,
  onDeleted,
  focusAfter,
}: {
  keys: readonly string[];
  onDeleted: () => void;
  /** Where focus goes once the dialog has gone with the bar: only then, since the dialog holds focus while open. */
  focusAfter: () => void;
}) {
  const [open, setOpen] = useState(false);
  const remove = useDeleteOrynxTickets();
  const deleted = useRef(false);
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
        <IconButton variant="danger-ghost" size="sm" label={selectionWords.deleteAll}>
          <Icon icon={Delete02Icon} aria-hidden className="size-4" />
        </IconButton>
      </AlertDialogTrigger>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          // Deleted: the bar and this button are gone, so focus goes to `focusAfter`'s place.
          if (!deleted.current) return;
          event.preventDefault();
          focusAfter();
        }}
      >
        <AlertDialogBody>
          <AlertDialogTitle>{selectionWords.deleteTitle(keys.length)}</AlertDialogTitle>
          <AlertDialogDescription>{selectionWords.deleteLine}</AlertDialogDescription>
          {remove.isError ? (
            <p role="alert" className="m-0 text-small text-danger">
              {selectionWords.deleteFailed}
            </p>
          ) : null}
        </AlertDialogBody>
        <AlertDialogFooter>
          <AlertDialogCancel>{selectionWords.cancel}</AlertDialogCancel>
          <AlertDialogAction
            pending={remove.isPending}
            onClick={(event) => {
              event.preventDefault();
              remove.mutate(keys, {
                onSuccess: () => {
                  deleted.current = true;
                  setOpen(false);
                  onDeleted();
                },
              });
            }}
          >
            {selectionWords.deleteAll}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
