import { Button, WorkItemShip } from '@devhub/ui';
import { useNewTask } from '../../../shell/use-shortcuts.ts';
import { useComposerStore } from '../../home/store.ts';
import { useTicketsStore } from '../store.ts';
import { selectionWords } from '../ticket-words.ts';

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
 * The tickets ticked, Ship and Clear (the user's call, 19 Oct 2026). Ship does what one ticket's Ship does, for
 * all of them in the order ticked, so Send starts one session with every ticket, the first its own (spec 022, Q2).
 * Clear puts focus where `onCleared` says, since its own button goes.
 */
export function ShipSelected({ onCleared }: { onCleared: () => void }) {
  const selected = useTicketsStore((state) => state.selected);
  const clear = useTicketsStore((state) => state.clearSelected);
  const addChip = useComposerStore((state) => state.addChip);
  const newTask = useNewTask();
  if (selected.length === 0) return null;
  return (
    <>
      <span className="text-small text-muted-foreground">{selectionWords.count(selected.length)}</span>
      <Button
        size="sm"
        onClick={() => {
          for (const key of selected) addChip({ kind: 'jira', key });
          clear();
          newTask();
        }}
      >
        {selectionWords.ship}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          clear();
          onCleared();
        }}
      >
        {selectionWords.clear}
      </Button>
    </>
  );
}
