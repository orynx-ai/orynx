import { ticketSource, type Session } from '@devhub/contracts';
import { ExternalLink, Markdown, Pill, SourceMark } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { duePill } from '../../../words/due.ts';
import { statusTones } from '../../../words/status-tone.ts';
import { useNow } from '../../../words/use-now.ts';
import { deletedLine, noDescription } from '../ticket-tab-words.ts';

/**
 * The session's own ticket, at the top of the Context tab (spec 013, Q7): the ticket as Claude got it, its
 * description laid out, with its status and due date as the cache knows them now and Open in Jira; one of Orynx's
 * own has its mark, no Open in Jira, and says when it was deleted since (spec 037). As wide as the Context tab
 * (the user's call, 20 Oct 2026, in place of `session.html`'s 640 px).
 */
export function TicketPanel({ session }: { session: Session }) {
  const platform = usePlatform();
  const now = useNow();
  const key = session.source?.kind === 'jira' ? session.source.key : null;
  const { ticket, jiraUrl } = session;
  const due = ticket?.dueDate == null ? null : duePill(ticket.dueDate, ticket.status?.column === 'done', now);
  const open = (url: string) => {
    platform.openExternal(url);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {key === null ? null : (
          <span className="inline-flex items-center gap-1.5">
            <SourceMark source={ticketSource(key)} label="hidden" />
            <span className="font-mono text-code">{key}</span>
          </span>
        )}
        {ticket?.type == null ? null : <span className="text-small text-muted-foreground">{ticket.type}</span>}
        {ticket?.status == null ? null : <Pill tone={statusTones[ticket.status.column]}>{ticket.status.name}</Pill>}
        {due === null ? null : (
          <Pill plain>
            <span aria-hidden>{due.text}</span>
            <span className="sr-only">{due.spoken}</span>
          </Pill>
        )}
        {jiraUrl === null ? null : (
          <ExternalLink href={jiraUrl} onOpen={open} className="ms-auto">
            Open in Jira
          </ExternalLink>
        )}
      </div>
      {key !== null && ticket?.deleted === true ? (
        <p className="m-0 text-muted-foreground">{deletedLine(key)}</p>
      ) : null}
      {ticket === null ? null : ticket.description === null ? (
        <p className="m-0 text-muted-foreground">{noDescription}</p>
      ) : (
        <Markdown text={ticket.description} onOpenLink={open} />
      )}
    </div>
  );
}
