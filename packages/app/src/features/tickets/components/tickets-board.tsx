import { useLayoutEffect, useRef, type FocusEvent, type RefObject } from 'react';
import type { Ticket, TicketColumn } from '@devhub/contracts';
import { Board, BoardColumn, EmptyState, WorkItemCardSkeleton, type StatusIconStatus } from '@devhub/ui';
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
  const board = useRef<HTMLDivElement>(null);
  const { remember, forget } = useFocusAcrossSyncs(board);
  return (
    <Board aria-label="Board" ref={board} onFocus={remember} onBlur={forget}>
      {columnOrder.map((column) => {
        const held = columns[column];
        const empty = columnEmptyText(column, before[column].length > 0);
        return (
          <BoardColumn
            key={column}
            data-column={column}
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

/**
 * Before the first sync (Q8a): the four columns with their icons and names, no counts, and three loading
 * cards each, the size of real ones, so nothing above the board moves when the tickets arrive.
 */
export function TicketsBoardSkeleton() {
  return (
    <Board aria-label="Board">
      {columnOrder.map((column) => (
        <BoardColumn key={column} status={statusIcons[column]} title={columnNames[column]} busy>
          <WorkItemCardSkeleton />
          <WorkItemCardSkeleton />
          <WorkItemCardSkeleton />
        </BoardColumn>
      ))}
    </Board>
  );
}

/** Where focus was on the board: the element, its card's ticket, and the card's place in its column. */
interface FocusedCard {
  element: Element;
  key: string;
  column: string;
  index: number;
}

function titleOf(card: Element | undefined): HTMLElement | null {
  return card?.querySelector<HTMLElement>('[data-slot="work-item-title"]') ?? null;
}

/**
 * AC-17, AC-18: a sync that takes the focused card away hands focus on instead of dropping it on the page.
 * A card that moved keeps it, in its new column; one that left gives it to the next card in its column,
 * or the one before, or the board itself. Focus that left the board on purpose is never taken back.
 */
function useFocusAcrossSyncs(board: RefObject<HTMLDivElement | null>) {
  const focused = useRef<FocusedCard | null>(null);

  useLayoutEffect(() => {
    const last = focused.current;
    const root = board.current;
    if (last === null || root === null || last.element.isConnected) return;
    if (document.activeElement !== null && document.activeElement !== document.body) return;
    focused.current = null;
    // Keys are letters, digits, a dash and an underscore (the contract), so they're safe in a selector.
    const moved = root.querySelector(`[data-key="${last.key}"]`);
    if (moved !== null) {
      titleOf(moved)?.focus();
      return;
    }
    const cards = Array.from(root.querySelectorAll(`[data-column="${last.column}"] [data-key]`));
    (titleOf(cards[last.index] ?? cards[last.index - 1]) ?? root).focus();
  });

  return {
    remember: (event: FocusEvent<HTMLDivElement>) => {
      const card = event.target.closest<HTMLElement>('[data-key]');
      const column = card?.closest<HTMLElement>('[data-column]');
      if (card === null || column === null || column === undefined) {
        focused.current = null;
        return;
      }
      const cards = Array.from(column.querySelectorAll('[data-key]'));
      focused.current = {
        element: event.target,
        key: card.dataset['key'] ?? '',
        column: column.dataset['column'] ?? '',
        index: cards.indexOf(card),
      };
    },
    forget: (event: FocusEvent<HTMLDivElement>) => {
      const { target, relatedTarget } = event;
      if (relatedTarget !== null) {
        if (!event.currentTarget.contains(relatedTarget)) focused.current = null;
        return;
      }
      // Nothing took focus: a click on the page, or the card leaving. Only a card that's still there was left.
      queueMicrotask(() => {
        if (focused.current?.element === target && target.isConnected) focused.current = null;
      });
    },
  };
}
