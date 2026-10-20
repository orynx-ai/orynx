import { isOrynxKey, type TicketDetail } from '@devhub/contracts';
import { Dialog, Markdown, Pill } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { dayMonth, calendarDay } from '../../../words/calendar.ts';
import { statusTones } from '../../../words/status-tone.ts';
import { useNow } from '../../../words/use-now.ts';
import { noDescription } from '../../sessions/ticket-tab-words.ts';
import { useTicket } from '../queries.ts';
import { useTicketDialogStore, type ShownTicket } from '../ticket-dialog-store.ts';
import { ticketDialogWords as words, ticketProblemLine } from '../ticket-words.ts';
import { OrynxTicketContent } from './orynx-ticket-view.tsx';
import {
  Detail,
  Problem,
  Section,
  TicketActions,
  TicketBodySkeleton,
  TicketDialogFrame,
} from './ticket-dialog-parts.tsx';

/**
 * The ticket dialog (spec 022, F): drawn once in the shell, so a title on Home, on Tickets or in ⌘K opens the
 * same one, and it stays open after ⌘K closes. Its focus goes back to what opened it. One of Orynx's own tickets
 * shows Orynx's view of it (spec 037).
 */
export function TicketDialog() {
  const shown = useTicketDialogStore((state) => state.shown);
  const close = useTicketDialogStore((state) => state.close);
  return (
    <Dialog
      open={shown !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      {/* Keyed by the ticket, so each opening reads it afresh and starts at the top. */}
      {shown === null ? null : isOrynxKey(shown.key) ? (
        <OrynxTicketContent key={shown.key} shown={shown} onClose={close} />
      ) : (
        <TicketDialogContent key={shown.key} shown={shown} onClose={close} />
      )}
    </Dialog>
  );
}

function TicketDialogContent({ shown, onClose }: { shown: ShownTicket; onClose: () => void }) {
  const ticket = useTicket(shown.key);
  const found = ticket.data?.result === 'found' ? ticket.data.ticket : null;
  const title = found?.title === undefined || found.title === '' ? (shown.title ?? shown.key) : found.title;
  const type = found?.type ?? shown.type;
  const url = found?.url ?? shown.url;

  return (
    <TicketDialogFrame
      source="jira"
      ticketKey={shown.key}
      type={type}
      title={title}
      busy={ticket.isPending}
      onClose={onClose}
      actions={<TicketActions ticketKey={shown.key} url={url} session={found?.session ?? null} onClose={onClose} />}
    >
      {found !== null ? (
        <TicketBody ticket={found} />
      ) : ticket.data !== undefined && ticket.data.result !== 'found' ? (
        <Problem line={ticketProblemLine(shown.key, ticket.data.result)} onRetry={() => void ticket.refetch()} />
      ) : ticket.isError ? (
        <Problem line={ticketProblemLine(shown.key, 'unreachable')} onRetry={() => void ticket.refetch()} />
      ) : (
        <TicketBodySkeleton />
      )}
    </TicketDialogFrame>
  );
}

/** AC-40, AC-45: the fields, the description, the linked issues and the comments, each with its empty words. */
function TicketBody({ ticket }: { ticket: TicketDetail }) {
  const platform = usePlatform();
  const now = useNow();
  const day = (iso: string) => dayMonth(new Date(iso), now).short;
  const open = (href: string) => {
    platform.openExternal(href);
  };
  return (
    <>
      <ul aria-label={words.details} className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-3 p-0 sm:grid-cols-4">
        {ticket.status === null ? null : (
          <Detail label={words.fields.status}>
            <Pill tone={statusTones[ticket.status.column]}>{ticket.status.name}</Pill>
          </Detail>
        )}
        {ticket.priority === null ? null : <Detail label={words.fields.priority}>{ticket.priority}</Detail>}
        <Detail label={words.fields.assignee}>{ticket.assignee ?? words.unassigned}</Detail>
        {ticket.reporter === null ? null : <Detail label={words.fields.reporter}>{ticket.reporter}</Detail>}
        {ticket.dueDate === null ? null : (
          <Detail label={words.fields.due}>{dayMonth(calendarDay(ticket.dueDate), now).short}</Detail>
        )}
        {ticket.labels.length === 0 ? null : <Detail label={words.fields.labels}>{ticket.labels.join(', ')}</Detail>}
        {ticket.created === null ? null : <Detail label={words.fields.created}>{day(ticket.created)}</Detail>}
        {ticket.updated === null ? null : <Detail label={words.fields.updated}>{day(ticket.updated)}</Detail>}
      </ul>
      <Section title={words.description}>
        {ticket.description === null ? (
          <p className="m-0 text-muted-foreground">{noDescription}</p>
        ) : (
          <Markdown text={ticket.description} onOpenLink={open} headingLevel={4} />
        )}
      </Section>
      <Section title={words.links}>
        {ticket.links.length === 0 ? (
          <p className="m-0 text-muted-foreground">{words.noLinks}</p>
        ) : (
          <ul aria-label={words.links} className="m-0 flex list-none flex-col gap-1 p-0">
            {ticket.links.map((link) => (
              <li key={`${link.relation}:${link.key}`} className="min-w-0 break-words">
                <span className="text-muted-foreground">{link.relation}</span>{' '}
                <span className="font-mono text-code">{link.key}</span> {link.title}
                {link.status === null ? null : <span className="text-muted-foreground"> · {link.status}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={words.comments}>
        {ticket.comments.length === 0 ? (
          <p className="m-0 text-muted-foreground">{words.noComments}</p>
        ) : (
          <ul aria-label={words.comments} className="m-0 flex list-none flex-col gap-4 p-0">
            {ticket.comments.map((comment, index) => (
              <li key={index} className="flex flex-col gap-1">
                <p className="m-0 text-small text-muted-foreground">
                  {comment.created === null ? comment.author : `${comment.author} · ${day(comment.created)}`}
                </p>
                <Markdown text={comment.body} onOpenLink={open} headingLevel={4} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
