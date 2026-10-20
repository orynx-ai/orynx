import { useId, useState, type ReactNode } from 'react';
import { Cancel01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { Link, useRouterState } from '@tanstack/react-router';
import type { TicketDetail } from '@devhub/contracts';
import {
  Button,
  DialogContent,
  DialogTitle,
  ExternalLink,
  Icon,
  IconButton,
  Skeleton,
  SourceMark,
  type Source,
} from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { useNewTask } from '../../../shell/use-shortcuts.ts';
import { holds } from '../../home/composer-rules.ts';
import { refusedLine } from '../../home/composer-words.ts';
import { useComposerStore } from '../../home/store.ts';
import { ticketDialogWords as words } from '../ticket-words.ts';

/**
 * The ticket dialog's frame (spec 022), the same for a Jira ticket and one of Orynx's own (spec 037): where the
 * ticket lives, its key and type, its title, Close; then a body that scrolls; then its actions.
 */
export function TicketDialogFrame({
  source,
  ticketKey,
  type,
  title,
  busy,
  onClose,
  actions,
  children,
}: {
  source: Source;
  ticketKey: string;
  type: string | null;
  title: string;
  busy: boolean;
  onClose: () => void;
  actions: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <DialogContent
      // Named by its title, which its scrolling body is named by too.
      aria-labelledby={titleId}
      onOpenAutoFocus={(event) => {
        // Focus on the dialog, not on Close: Close's tooltip would take the first Esc (AC-46).
        event.preventDefault();
        if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
      }}
    >
      <div className="flex shrink-0 items-start gap-3 px-6 pt-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2 text-small text-muted-foreground">
            <SourceMark source={source} label="hidden" />
            <span className="font-mono text-code text-foreground">{ticketKey}</span>
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
        aria-busy={busy}
        className="flex min-h-0 flex-col gap-6 overflow-y-auto px-6 py-4 focus-visible:-outline-offset-2"
      >
        {children}
      </div>
      {actions}
    </DialogContent>
  );
}

export function Problem({ line, onRetry }: { line: string; onRetry: () => void }) {
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

/** AC-43: rows the size of the fields and the description while the ticket is read. */
export function TicketBodySkeleton() {
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

/** One field of the ticket's: its name above, its value below. */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="flex min-w-0 flex-col gap-0.5">
      <span className="text-small text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
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

/**
 * AC-41, AC-42: Open in Jira when the ticket has a page there, Open session when there is one, then Add to composer,
 * the one primary action. `start` sits apart at the start, such as Delete ticket, and `extra` before Add to composer,
 * such as Edit (spec 037). Adding from Tickets or ⌘K opens Home with focus in the box, as Ship does; on Home, focus goes
 * back to the title.
 */
export function TicketActions({
  ticketKey,
  url,
  session,
  onClose,
  start,
  extra,
  problem,
}: {
  ticketKey: string;
  url: string | null;
  session: TicketDetail['session'];
  onClose: () => void;
  start?: ReactNode;
  extra?: ReactNode;
  /** A line above the actions, such as a change that didn't save (spec 037). */
  problem?: string | null;
}) {
  const platform = usePlatform();
  const chip = { kind: 'jira', key: ticketKey } as const;
  const held = useComposerStore((state) => holds(state.chips, chip));
  const addChip = useComposerStore((state) => state.addChip);
  const onHome = useRouterState({ select: (state) => state.location.pathname === '/' });
  const newTask = useNewTask();
  const [refused, setRefused] = useState<string | null>(null);
  const line = refused ?? problem ?? null;

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border px-6 py-4">
      {line === null ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {line}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        {start === undefined ? null : <div className="me-auto">{start}</div>}
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
        {extra}
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
