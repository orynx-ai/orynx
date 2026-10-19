import { useId, useState } from 'react';
import { Cancel01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { Link, useRouterState } from '@tanstack/react-router';
import type { TicketDetail } from '@devhub/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  ExternalLink,
  Icon,
  IconButton,
  Markdown,
  Pill,
  Skeleton,
  SourceMark,
} from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { useNewTask } from '../../../shell/use-shortcuts.ts';
import { dayMonth, calendarDay } from '../../../words/calendar.ts';
import { statusTones } from '../../../words/status-tone.ts';
import { useNow } from '../../../words/use-now.ts';
import { holds } from '../../home/composer-rules.ts';
import { refusedLine } from '../../home/composer-words.ts';
import { useComposerStore } from '../../home/store.ts';
import { noDescription } from '../../sessions/ticket-tab-words.ts';
import { useTicket } from '../queries.ts';
import { useTicketDialogStore, type ShownTicket } from '../ticket-dialog-store.ts';
import { ticketDialogWords as words, ticketProblemLine } from '../ticket-words.ts';

/**
 * The ticket dialog (spec 022, F): drawn once in the shell, so a title on Home, on Tickets or in ⌘K opens the
 * same one, and it stays open after ⌘K closes. Its focus goes back to what opened it.
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
      {shown === null ? null : <TicketDialogContent key={shown.key} shown={shown} onClose={close} />}
    </Dialog>
  );
}

function TicketDialogContent({ shown, onClose }: { shown: ShownTicket; onClose: () => void }) {
  const titleId = useId();
  const ticket = useTicket(shown.key);
  const found = ticket.data?.result === 'found' ? ticket.data.ticket : null;
  const title = found?.title === undefined || found.title === '' ? (shown.title ?? shown.key) : found.title;
  const type = found?.type ?? shown.type;
  const url = found?.url ?? shown.url;

  return (
    <DialogContent
      onOpenAutoFocus={(event) => {
        // Focus on the dialog, not on Close: Close's tooltip would take the first Esc (AC-46).
        event.preventDefault();
        if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
      }}
    >
      <div className="flex shrink-0 items-start gap-3 px-6 pt-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2 text-small text-muted-foreground">
            <SourceMark source="jira" label="hidden" />
            <span className="font-mono text-code text-foreground">{shown.key}</span>
            {type === null ? null : <span>{type}</span>}
          </div>
          <DialogTitle id={titleId}>{title}</DialogTitle>
        </div>
        <IconButton variant="ghost" size="sm" label={words.close} onClick={onClose}>
          <Icon icon={Cancel01Icon} aria-hidden />
        </IconButton>
      </div>
      {/* It scrolls when the ticket is long, so it takes focus to scroll by keyboard (AC-47); the ring is drawn inside. */}
      <div
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region must take keyboard focus (WCAG 2.1.1)
        tabIndex={0}
        aria-labelledby={titleId}
        aria-busy={ticket.isPending}
        className="flex min-h-0 flex-col gap-6 overflow-y-auto px-6 py-4 focus-visible:-outline-offset-2"
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
      </div>
      <Actions ticketKey={shown.key} url={url} session={found?.session ?? null} onClose={onClose} />
    </DialogContent>
  );
}

function Problem({ line, onRetry }: { line: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert" className="m-0 text-danger">
        {line}
      </p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        {words.tryAgain}
      </Button>
    </div>
  );
}

/** AC-43: rows the size of the fields and the description while Jira answers. */
function TicketBodySkeleton() {
  return (
    <>
      <p role="status" className="sr-only">
        {words.loading}
      </p>
      <div aria-hidden className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {Object.keys(words.fields).map((field) => (
          <div key={field} className="flex flex-col gap-0.5">
            <span className="flex h-5 items-center">
              <Skeleton className="h-3.5 w-16" />
            </span>
            <span className="flex h-6 items-center">
              <Skeleton className="h-4 w-24" />
            </span>
          </div>
        ))}
      </div>
      <div aria-hidden className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex min-w-0 flex-col gap-0.5">
      <span className="text-small text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="m-0 text-body font-medium">
        {title}
      </h3>
      {children}
    </section>
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
          <Field label={words.fields.status}>
            <Pill tone={statusTones[ticket.status.column]}>{ticket.status.name}</Pill>
          </Field>
        )}
        {ticket.priority === null ? null : <Field label={words.fields.priority}>{ticket.priority}</Field>}
        <Field label={words.fields.assignee}>{ticket.assignee ?? words.unassigned}</Field>
        {ticket.reporter === null ? null : <Field label={words.fields.reporter}>{ticket.reporter}</Field>}
        {ticket.dueDate === null ? null : (
          <Field label={words.fields.due}>{dayMonth(calendarDay(ticket.dueDate), now).short}</Field>
        )}
        {ticket.labels.length === 0 ? null : <Field label={words.fields.labels}>{ticket.labels.join(', ')}</Field>}
        {ticket.created === null ? null : <Field label={words.fields.created}>{day(ticket.created)}</Field>}
        {ticket.updated === null ? null : <Field label={words.fields.updated}>{day(ticket.updated)}</Field>}
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

/**
 * AC-41, AC-42: Open in Jira, Open session when there is one, then Add to composer, the one primary action.
 * Adding from Tickets or ⌘K opens Home with focus in the box, as Ship does; on Home, focus goes back to the title.
 */
function Actions({
  ticketKey,
  url,
  session,
  onClose,
}: {
  ticketKey: string;
  url: string | null;
  session: TicketDetail['session'];
  onClose: () => void;
}) {
  const platform = usePlatform();
  const chip = { kind: 'jira', key: ticketKey } as const;
  const held = useComposerStore((state) => holds(state.chips, chip));
  const addChip = useComposerStore((state) => state.addChip);
  const onHome = useRouterState({ select: (state) => state.location.pathname === '/' });
  const newTask = useNewTask();
  const [refused, setRefused] = useState<string | null>(null);

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border px-6 py-4">
      {refused === null ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {refused}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        {url === null ? null : (
          <ExternalLink
            href={url}
            size="body"
            onOpen={(href) => {
              platform.openExternal(href);
            }}
          >
            {words.openInJira}
          </ExternalLink>
        )}
        {session === null ? null : (
          <Button asChild variant="secondary">
            <Link to="/sessions/$sessionId" params={{ sessionId: session.id }} onClick={onClose}>
              {words.openSession}
            </Link>
          </Button>
        )}
        {held ? (
          <Button variant="primary" disabled>
            <Icon icon={Tick02Icon} aria-hidden />
            {words.inComposer}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => {
              const refusal = addChip(chip);
              if (refusal !== null) {
                setRefused(refusedLine(refusal));
                return;
              }
              onClose();
              if (!onHome) newTask();
            }}
          >
            {words.addToComposer}
          </Button>
        )}
      </div>
    </div>
  );
}
