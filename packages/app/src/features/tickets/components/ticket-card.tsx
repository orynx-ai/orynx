import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { Ticket } from '@devhub/contracts';
import { AgentChip, WorkItemCard, WorkItemTitle } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { dueText } from '../../../words/due.ts';
import { assigneeAvatar } from '../ticket-words.ts';
import { ShipWithClaude } from '../../sessions/components/ship-with-claude.tsx';

/**
 * A ticket's title as a link (Q4a): to its session inside DevHub when it has one, otherwise to the issue in
 * Jira, opened by the host (a new tab, or the system's browser).
 */
export function TicketTitleLink({ ticket }: { ticket: Ticket }) {
  const platform = usePlatform();
  if (ticket.session !== null) {
    return (
      <WorkItemTitle asChild>
        <Link to="/sessions/$sessionId" params={{ sessionId: ticket.session.id }}>
          {ticket.title}
        </Link>
      </WorkItemTitle>
    );
  }
  return (
    // It leaves Orynx, so it has the external link's arrow (the user's call, 18 Oct 2026).
    <WorkItemTitle
      external
      href={ticket.url}
      rel="noreferrer"
      onClick={(event) => {
        event.preventDefault();
        platform.openExternal(ticket.url);
      }}
    >
      {ticket.title}
    </WorkItemTitle>
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
      title={<TicketTitleLink ticket={ticket} />}
      // A ticket with a live session shows its chip; one without, Ship (spec 011, named in spec 020).
      action={
        ticket.session === null ? (
          <ShipWithClaude ticketKey={ticket.key} look="sparkle" />
        ) : (
          <TicketAgentChip ticket={ticket} />
        )
      }
    />
  );
}
