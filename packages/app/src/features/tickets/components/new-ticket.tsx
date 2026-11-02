import { useCallback, useId, type ReactNode } from 'react';
import { PlusSignIcon } from '@hugeicons/core-free-icons';
import type { NewJiraTicket, NewJiraTicketAnswer, OrynxTicketFields, TicketColumn } from '@devhub/contracts';
import { BrandMark, Button, Dialog, DialogContent, ExternalLink, Icon, IconButton } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { useCreateJiraTicket, useCreateOrynxTicket, useJiraTicketTypes } from '../queries.ts';
import { useTicketsStore } from '../store.ts';
import { orynxTicketWords as words } from '../ticket-words.ts';
import { TicketForm } from './ticket-form.tsx';

/** A new ticket's fields, as the server's own defaults: a Task of Medium priority, in `column` (AC-6). */
function newTicketFields(column: TicketColumn): OrynxTicketFields {
  return { title: '', description: '', type: 'Task', priority: 'Medium', status: column, dueDate: null };
}

/** The page bar's New ticket, where focus goes once a ticket is deleted, its card gone (AC-18). */
export const pageNewTicket: { current: HTMLButtonElement | null } = { current: null };

/**
 * New ticket in the page bar, or under an empty board (spec 037, AC-5, AC-6): a ticket that starts in To do. Under
 * 768 px the page bar's is its icon alone, with its tooltip, so the bar keeps to the window's width (AC-36).
 */
export function NewTicketButton({
  size = 'sm',
  inPageBar = false,
  compact = false,
}: {
  size?: 'default' | 'sm';
  inPageBar?: boolean;
  compact?: boolean;
}) {
  const open = useTicketsStore((state) => state.openNewTicket);
  const remember = (button: HTMLButtonElement | null) => {
    if (inPageBar) pageNewTicket.current = button;
  };
  if (compact) {
    return (
      <IconButton
        ref={remember}
        size="sm"
        label={words.newTicket}
        onClick={() => {
          open('to_do');
        }}
      >
        <Icon icon={PlusSignIcon} aria-hidden />
      </IconButton>
    );
  }
  return (
    <Button
      ref={remember}
      size={size}
      // The page bar's says New, so the bar fits; its name still says what it makes (the user's call, 20 Oct 2026).
      {...(inPageBar ? { 'aria-label': words.newTicket } : {})}
      onClick={() => {
        open('to_do');
      }}
    >
      <Icon icon={PlusSignIcon} aria-hidden />
      {inPageBar ? words.newShort : words.newTicket}
    </Button>
  );
}

/** A column's +, as `tickets.html` draws it: a ticket that starts in that column (AC-8). */
export function NewTicketInColumn({ column }: { column: TicketColumn }) {
  const open = useTicketsStore((state) => state.openNewTicket);
  return (
    <IconButton
      variant="ghost"
      size="sm"
      label={words.newTicketIn(column)}
      onClick={() => {
        open(column);
      }}
    >
      <Icon icon={PlusSignIcon} aria-hidden />
    </IconButton>
  );
}

/** Where a new Jira ticket goes (spec 019): the project and the sprint Tickets shows, or no sprint. */
export interface JiraTarget {
  project: string;
  sprint: { id: number; name: string } | null;
}

/** What Jira didn't do, in its words (AC-9 to AC-11); null for a ticket that's made in full, or none asked for yet. */
function jiraLine(target: JiraTarget, asked: NewJiraTicket, answer: NewJiraTicketAnswer): string | null {
  switch (answer.result) {
    case 'made':
      return null;
    case 'refused':
      return words.jiraRefused(answer.reason);
    case 'unreachable':
      return words.jiraUnreachable(target.project);
    case 'made_but':
      return answer.missed === 'sprint'
        ? words.madeButSprint(answer.key, target.sprint?.name ?? target.project, answer.reason)
        : words.madeButColumn(answer.key, asked.column, answer.reason);
  }
}

/**
 * The New ticket form in a dialog (spec 037, AC-6 to AC-12): Task, Medium and the column it was opened from by
 * default. It closes once the ticket is made, and focus goes back to the button that opened it; a save that fails
 * keeps it open with your values. While a save is on its way it doesn't close. With a Jira `target`, the ticket goes
 * to Jira first, and Save in offers Orynx too while `orynx` shows (spec 019).
 */
export function NewTicketDialog({
  jira,
  target = null,
  orynx = true,
}: {
  jira: boolean;
  target?: JiraTarget | null;
  orynx?: boolean;
}) {
  const column = useTicketsStore((state) => state.newTicket);
  const close = useTicketsStore((state) => state.closeNewTicket);
  const create = useCreateOrynxTicket();
  const createJira = useCreateJiraTicket();
  const types = useJiraTicketTypes(target?.project ?? null, column !== null);
  const headingId = useId();
  const noteId = useId();
  const platform = usePlatform();
  const saving = create.isPending || createJira.isPending;
  const reset = () => {
    create.reset();
    createJira.reset();
  };
  // Close takes focus once it replaces Create ticket, so it isn't lost (AC-10).
  const focusClose = useCallback((button: HTMLButtonElement | null) => {
    button?.focus();
  }, []);
  const { data: answer, variables: asked } = createJira;
  const line = target === null || answer === undefined ? null : jiraLine(target, asked, answer);
  // Made, though not in full (Q5): it's kept, never made again, and Jira holds the rest.
  const done: ReactNode =
    answer?.result === 'made_but' ? (
      <>
        <ExternalLink
          href={answer.url}
          size="body"
          onOpen={(href) => {
            platform.openExternal(href);
          }}
        >
          {words.openKeyInJira(answer.key)}
        </ExternalLink>
        <Button
          ref={focusClose}
          variant="secondary"
          onClick={() => {
            close();
            reset();
          }}
        >
          {words.close}
        </Button>
      </>
    ) : undefined;

  return (
    <Dialog
      open={column !== null}
      onOpenChange={(open) => {
        if (open || saving) return;
        close();
        reset();
      }}
    >
      {column === null ? null : (
        <DialogContent
          aria-labelledby={headingId}
          aria-describedby={noteId}
          onOpenAutoFocus={(event) => {
            // Title first, past Save in above it (spec 019, AC-1).
            const title = (event.currentTarget as HTMLElement | null)?.querySelector('input');
            if (title === null || title === undefined) return;
            event.preventDefault();
            title.focus();
          }}
        >
          <TicketForm
            // A fresh form each time it opens, so a closed dialog never leaves its values behind.
            key={column}
            heading={words.newTicket}
            headingId={headingId}
            // Where the ticket goes, with Orynx's mark (the user's ask, spec 039, AC-40, AC-41).
            note={
              <p id={noteId} className="m-0 flex items-center gap-2 text-small text-muted-foreground">
                <BrandMark className="h-3 w-5" />
                {words.savedHere(jira)}
              </p>
            }
            jira={
              target === null
                ? undefined
                : {
                    project: target.project,
                    note: (
                      <p id={noteId} className="m-0 text-small text-muted-foreground">
                        {words.goesToJira(target.project, target.sprint?.name ?? null)}
                      </p>
                    ),
                    orynx,
                    types: types.isSuccess
                      ? { state: 'ready', types: types.data.types }
                      : types.isError
                        ? { state: 'failed', retry: () => void types.refetch() }
                        : { state: 'loading' },
                    onSubmit: (fields) =>
                      createJira
                        .mutateAsync({ ...fields, projectKey: target.project, sprintId: target.sprint?.id ?? null })
                        .then(
                          (answer) => {
                            if (answer.result !== 'made') return;
                            close();
                            reset();
                          },
                          // The form says the save failed; the dialog stays open with your values.
                          () => undefined,
                        ),
                  }
            }
            defaults={newTicketFields(column)}
            submitLabel={words.create}
            saving={saving}
            problem={create.isError || createJira.isError ? words.saveFailed : line}
            done={done}
            onSubmit={(fields) =>
              create.mutateAsync(fields).then(
                () => {
                  close();
                  reset();
                },
                // The form says the save failed; the dialog stays open with your values.
                () => undefined,
              )
            }
            onCancel={() => {
              close();
              reset();
            }}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}
