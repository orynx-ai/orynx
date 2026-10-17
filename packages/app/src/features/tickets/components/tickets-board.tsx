import type { Ticket, TicketColumn } from '@devhub/contracts';
import { Board, BoardColumn, EmptyState, type StatusIconStatus } from '@devhub/ui';
import { byColumn } from '../filters.ts';
import { columnEmptyText, columnNames, columnOrder, columnRegionName } from '../ticket-words.ts';
import { TicketCard } from './ticket-card.tsx';

const statusIcons: Record<TicketColumn, StatusIconStatus> = {
  to_do: 'todo',
  in_progress: 'in_progress',
  in_review: 'in_review',
  done: 'done',
};

export interface TicketsBoardProps {
  /** The tickets every filter lets through, in rank order. */
  shown: readonly Ticket[];
  /** The tickets Assigned to me alone lets through, so an empty column can say why it's empty (Q9d). */
  unfiltered: readonly Ticket[];
  now: Date;
}

/** The sprint's four columns (spec 008, Q2), each with its count and cards, or why it's empty. */
export function TicketsBoard({ shown, unfiltered, now }: TicketsBoardProps) {
  const columns = byColumn(shown);
  const before = byColumn(unfiltered);
  return (
    <Board aria-label="Board">
      {columnOrder.map((column) => {
        const held = columns[column];
        const empty = columnEmptyText(column, before[column].length > 0);
        return (
          <BoardColumn
            key={column}
            status={statusIcons[column]}
            title={columnNames[column]}
            count={held.length}
            aria-label={columnRegionName(column, held.length)}
          >
            {held.length === 0 ? (
              <EmptyState title={empty.title}>{empty.line === null ? null : <span>{empty.line}</span>}</EmptyState>
            ) : (
              held.map((ticket) => <TicketCard key={ticket.key} ticket={ticket} now={now} />)
            )}
          </BoardColumn>
        );
      })}
    </Board>
  );
}
