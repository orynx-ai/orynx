import { Button, WorkItemShip } from '@devhub/ui';
import { useNewTask } from '../../../shell/use-shortcuts.ts';
import { useComposerStore } from '../../home/store.ts';

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
