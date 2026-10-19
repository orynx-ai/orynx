import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { Ticket } from '@devhub/contracts';
import { AgentChip, WorkItemCard, WorkItemTitleButton } from '@devhub/ui';
import { dueText } from '../../../words/due.ts';
import { assigneeAvatar } from '../ticket-words.ts';
import { ShipButton } from './ship-button.tsx';
import { useTicketDialogStore } from '../ticket-dialog-store.ts';

/**
 * A ticket's title opens the ticket dialog (spec 022, Q8), with or without a session: the dialog has Open in
 * Jira, and Open session when there is one. Claude's state chip still opens the session (AC-48).
 */
export function TicketTitleButton({ ticket }: { ticket: Ticket }) {
  const show = useTicketDialogStore((state) => state.show);
  return (
    <WorkItemTitleButton
      onClick={() => {
        show({ key: ticket.key, title: ticket.title, type: ticket.type, url: ticket.url });
      }}
    >
      {ticket.title}
    </WorkItemTitleButton>
  );
}

/** Claude's state for the ticket, linking to its session (Q4c); nothing when no session works on it. */
export function TicketAgentChip({ ticket }: { ticket: Ticket }) {
  if (ticket.session === null) return null;
  return (
    <AgentChip state={ticket.session.state} asChild>
      <Link to="/sessions/$sessionId" params={{ sessionId: ticket.session.id }} />
    </AgentChip>
  );
}

/** The due date as the eye reads it ("Mon"), and in words for a screen reader ("Due Monday"), Q7b. */
export function dueLabel(ticket: Ticket, now: Date): { label: ReactNode; soon: boolean } | null {
  if (ticket.dueDate === null) return null;
  const due = dueText(ticket.dueDate, ticket.column === 'done', now);
  return {
    label: (
      <>
        <span aria-hidden>{due.text}</span>
        <span className="sr-only">{due.spoken}</span>
      </>
    ),
    soon: due.soon,
  };
}

/** One ticket on the board (spec 008): 006's WorkItemCard with the ticket's data and words. */
export function TicketCard({ ticket, now }: { ticket: Ticket; now: Date }) {
  const avatar = assigneeAvatar(ticket.assignee);
  const due = dueLabel(ticket, now);
  return (
    <WorkItemCard
      // The board finds a card by its ticket to keep focus across syncs (AC-18).
      data-key={ticket.key}
      itemKey={ticket.key}
      type={ticket.type}
      bug={ticket.bug}
      assignee={avatar ?? undefined}
      priority={ticket.priority === null ? undefined : { level: ticket.priority.level, label: ticket.priority.name }}
      due={due ?? undefined}
      title={<TicketTitleButton ticket={ticket} />}
      // A ticket with a live session shows its chip; one without, Ship (spec 011, named in spec 020).
      action={
        ticket.session === null ? (
          <ShipButton ticketKey={ticket.key} look="sparkle" />
        ) : (
          <TicketAgentChip ticket={ticket} />
        )
      }
    />
  );
}
