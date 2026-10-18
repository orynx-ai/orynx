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
  /** The tickets Assignee alone lets through, so an empty column can say why it's empty (Q9d). */
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
 * A card that moved keeps it, in its new column or its new place in the same column (the browser drops
 * focus from an element it moves); one that left gives it to the next card in its column, or the one
 * before, or the board itself. Focus that went elsewhere on the page is never taken back; focus that left
 * with the window (another tab) still moves on.
 */
function useFocusAcrossSyncs(board: RefObject<HTMLDivElement | null>) {
  const focused = useRef<FocusedCard | null>(null);

  useLayoutEffect(() => {
    const last = focused.current;
    const root = board.current;
    if (last === null || root === null) return;
    if (document.activeElement !== null && document.activeElement !== document.body) return;
    if (last.element.isConnected) {
      // The card is still here, moved by the sync.
      if (last.element instanceof HTMLElement) last.element.focus({ preventScroll: true });
      return;
    }
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
      // Nothing took focus. A click on the page left the card; another window or tab, or the card moving or
      // leaving, didn't, so the board can still hand focus on.
      queueMicrotask(() => {
        const leftOnPurpose = document.hasFocus() && document.activeElement !== target && target.isConnected;
        if (focused.current?.element === target && leftOnPurpose) focused.current = null;
      });
    },
  };
}
