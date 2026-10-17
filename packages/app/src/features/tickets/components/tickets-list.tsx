import type { Ticket } from '@devhub/contracts';
import {
  EmptyState,
  Panel,
  Pill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowSkeleton,
  WorkItemKey,
  WorkItemPriority,
} from '@devhub/ui';
import { inListOrder } from '../filters.ts';
import { listCaption, listEmptyText, statusTones } from '../ticket-words.ts';
import { dueLabel, TicketAgentChip, TicketTitleLink } from './ticket-card.tsx';

export interface TicketsListProps {
  /** The tickets every filter lets through. */
  shown: readonly Ticket[];
  sprintName: string;
  /** Due this week, Bugs only or a search is on (Q9e). */
  filtered: boolean;
  /** Assigned to me is on (Q9e). */
  onlyMine: boolean;
  now: Date;
}

/** The sprint as a table (spec 008, AC-11): the board's tickets, column by column, then in rank order. */
export function TicketsList({ shown, sprintName, filtered, onlyMine, now }: TicketsListProps) {
  if (shown.length === 0) {
    const empty = listEmptyText(sprintName, { filtered, onlyMine });
    return (
      <Panel>
        <EmptyState title={empty.title}>
          <span>{empty.line}</span>
        </EmptyState>
      </Panel>
    );
  }
  return (
    <Panel>
      {/* 760 px at least, as the design draws it: a narrow window scrolls the table inside the panel. */}
      <Table caption={listCaption(sprintName)} className="min-w-190">
        <ListHead />
        <TableBody>
          {inListOrder(shown).map((ticket) => (
            <TableRow key={ticket.key}>
              <TableCell>
                <WorkItemKey>{ticket.key}</WorkItemKey>
              </TableCell>
              {/* The title is the one cell that wraps; keys, dates and chips stay on one line, as shadcn's table keeps them. */}
              <TableCell className="whitespace-normal">
                <TicketTitleLink ticket={ticket} />
              </TableCell>
              <TableCell>
                <Pill tone={statusTones[ticket.column]}>{ticket.status}</Pill>
              </TableCell>
              <TableCell>
                {ticket.priority === null ? null : (
                  <WorkItemPriority level={ticket.priority.level} label={ticket.priority.name} />
                )}
              </TableCell>
              <TableCell>{dueLabel(ticket, now)?.label ?? null}</TableCell>
              <TableCell className="text-end">
                <TicketAgentChip ticket={ticket} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

const columns = 6;

function ListHead() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Key</TableHead>
        <TableHead>Title</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Priority</TableHead>
        <TableHead>Due</TableHead>
        <TableHead>
          <span className="sr-only">Agent</span>
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

/** Before the first sync (Q8a): the list's head and six loading rows, as tall as real ones. */
export function TicketsListSkeleton() {
  return (
    <Panel>
      <Table caption="Tickets" className="min-w-190" aria-busy>
        <ListHead />
        <TableBody>
          {Array.from({ length: 6 }, (_, row) => (
            <TableRowSkeleton key={row} columns={columns} />
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}
