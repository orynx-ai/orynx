import { useId, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { orynxStatusNames, TicketColumnSchema, type OrynxTicket, type TicketColumn } from '@devhub/contracts';
import {
  Button,
  DialogContent,
  Markdown,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@devhub/ui';
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
import { TicketForm } from './ticket-form.tsx';
import { DeleteTicket } from './delete-ticket.tsx';
import { pageNewTicket } from './new-ticket.tsx';

/**
 * One of Orynx's own tickets in the ticket dialog (spec 037, AC-13, AC-14): the Orynx mark, its fields and Markdown
 * description, who made it, and a Status picker that saves as soon as you pick, which is how a ticket moves between
 * columns. Its actions are the dialog's, without Open in Jira, and Edit, which turns the dialog into the New ticket
 * form, filled in.
 */
export function OrynxTicketContent({ shown, onClose }: { shown: ShownTicket; onClose: () => void }) {
  const ticket = useOrynxTicket(shown.key);
  const update = useUpdateOrynxTicket();
  const found = ticket.data?.result === 'found' ? ticket.data.ticket : null;
  const gone = ticket.data?.result === 'not_found';
  // Editing: the version the form saves on, and what to say above its buttons (AC-15, AC-16).
  const [editing, setEditing] = useState<{ version: number; problem: string | null } | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const headingId = useId();

  // Back in the view after editing, focus goes back to Edit.
  const [edited, setEdited] = useState(false);
  function stopEditing() {
    setEditing(null);
    setEdited(true);
  }

  if (found !== null && editing !== null) {
    return (
      <DialogContent aria-labelledby={headingId}>
        <TicketForm
          heading={orynxTicketWords.editTitle(found.key)}
          headingId={headingId}
          defaults={found}
          submitLabel={orynxTicketWords.saveChanges}
          saving={update.isPending}
          problem={editing.problem}
          onSubmit={(fields) =>
            update.mutateAsync({ key: found.key, change: { ...fields, version: editing.version } }).then(
              (answer) => {
                if (answer.result === 'saved') stopEditing();
                // Someone saved first: keep your edits, and let a second save write over theirs.
                else if (answer.result === 'changed') {
                  setEditing({ version: answer.ticket.version, problem: orynxTicketWords.changed(found.key) });
                } else setEditing({ ...editing, problem: orynxTicketWords.deleted(found.key) });
              },
              () => {
                setEditing({ ...editing, problem: orynxTicketWords.saveFailed });
              },
            )
          }
          onCancel={stopEditing}
        />
      </DialogContent>
    );
  }

  return (
    <TicketDialogFrame
      source="orynx"
      ticketKey={shown.key}
      type={found?.type ?? shown.type}
      title={found?.title ?? shown.title ?? shown.key}
      busy={ticket.isPending}
      onClose={onClose}
      initialFocus={edited ? editButton : undefined}
      actions={
        found === null ? null : (
          <TicketActions
            ticketKey={found.key}
            url={null}
            session={found.session}
            onClose={onClose}
            problem={update.isError ? orynxTicketWords.saveFailed : null}
            start={
              <DeleteTicket
                ticketKey={found.key}
                onDeleted={() => {
                  onClose();
                  // Its card is gone with it, so focus goes to New ticket when Tickets is open (AC-18).
                  requestAnimationFrame(() => pageNewTicket.current?.focus());
                }}
              />
            }
            extra={
              <Button
                ref={editButton}
                variant="secondary"
                onClick={() => {
                  update.reset();
                  setEditing({ version: found.version, problem: null });
                }}
              >
                {orynxTicketWords.edit}
              </Button>
            }
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
