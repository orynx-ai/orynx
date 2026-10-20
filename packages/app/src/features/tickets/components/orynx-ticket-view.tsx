import { Link } from '@tanstack/react-router';
import { orynxStatusNames, TicketColumnSchema, type OrynxTicket, type TicketColumn } from '@devhub/contracts';
import { Markdown, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { calendarDay, dayMonth } from '../../../words/calendar.ts';
import { useNow } from '../../../words/use-now.ts';
import { noDescription } from '../../sessions/ticket-tab-words.ts';
import { useOrynxTicket, useUpdateOrynxTicket } from '../queries.ts';
import type { ShownTicket } from '../ticket-dialog-store.ts';
import { createdByWords, orynxTicketWords, ticketDialogWords as words } from '../ticket-words.ts';
import {
  Detail,
  Problem,
  Section,
  TicketActions,
  TicketBodySkeleton,
  TicketDialogFrame,
} from './ticket-dialog-parts.tsx';

/**
 * One of Orynx's own tickets in the ticket dialog (spec 037, AC-13, AC-14): the Orynx mark, its fields and Markdown
 * description, who made it, and a Status picker that saves as soon as you pick, which is how a ticket moves between
 * columns. Its actions are the dialog's, without Open in Jira.
 */
export function OrynxTicketContent({ shown, onClose }: { shown: ShownTicket; onClose: () => void }) {
  const ticket = useOrynxTicket(shown.key);
  const update = useUpdateOrynxTicket();
  const found = ticket.data?.result === 'found' ? ticket.data.ticket : null;
  const gone = ticket.data?.result === 'not_found';

  return (
    <TicketDialogFrame
      source="orynx"
      ticketKey={shown.key}
      type={found?.type ?? shown.type}
      title={found?.title ?? shown.title ?? shown.key}
      busy={ticket.isPending}
      onClose={onClose}
      actions={
        found === null ? null : (
          <TicketActions
            ticketKey={found.key}
            url={null}
            session={found.session}
            onClose={onClose}
            problem={update.isError ? orynxTicketWords.saveFailed : null}
          />
        )
      }
    >
      {found !== null ? (
        <OrynxTicketBody
          ticket={found}
          onStatus={(status) => {
            update.mutate({ key: found.key, change: { status } });
          }}
        />
      ) : gone ? (
        <p className="m-0 text-muted-foreground">{orynxTicketWords.deleted(shown.key)}</p>
      ) : ticket.isError ? (
        <Problem line={orynxTicketWords.saveFailed} onRetry={() => void ticket.refetch()} />
      ) : (
        <TicketBodySkeleton />
      )}
    </TicketDialogFrame>
  );
}

const statusOptions = TicketColumnSchema.options.map((value) => ({ value, label: orynxStatusNames[value] }));

function OrynxTicketBody({ ticket, onStatus }: { ticket: OrynxTicket; onStatus: (status: TicketColumn) => void }) {
  const platform = usePlatform();
  const now = useNow();
  const created = createdByWords(ticket.createdBy, dayMonth(new Date(ticket.createdAt), now).short);
  return (
    <>
      <ul aria-label={words.details} className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-3 p-0 sm:grid-cols-4">
        <Detail label={words.fields.status}>
          {/* Saves at once, as Jira's does: there's no dragging between columns (Q7). */}
          <Select
            value={ticket.status}
            onValueChange={(status) => {
              const picked = TicketColumnSchema.safeParse(status);
              if (picked.success && picked.data !== ticket.status) onStatus(picked.data);
            }}
          >
            <SelectTrigger aria-label={words.fields.status} className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Detail>
        <Detail label={words.fields.priority}>{ticket.priority}</Detail>
        {ticket.dueDate === null ? null : (
          <Detail label={words.fields.due}>{dayMonth(calendarDay(ticket.dueDate), now).short}</Detail>
        )}
      </ul>
      <p className="m-0 text-small text-muted-foreground">
        {created.by}
        {created.session === null ? null : (
          <Link to="/sessions/$sessionId" params={{ sessionId: created.session.id }} className="text-info underline">
            {created.session.title}
          </Link>
        )}
      </p>
      <Section title={words.description}>
        {ticket.description === '' ? (
          <p className="m-0 text-muted-foreground">{noDescription}</p>
        ) : (
          <Markdown
            text={ticket.description}
            onOpenLink={(href) => {
              platform.openExternal(href);
            }}
            headingLevel={4}
          />
        )}
      </Section>
    </>
  );
}
