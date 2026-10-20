import { File01Icon } from '@hugeicons/core-free-icons';
import { ticketSource, type ComposerChip, type Session } from '@devhub/contracts';
import { AttentionList, AttentionTitleButton, Callout, CopyButton, ExternalLink, Icon, SourceMark } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { chipLabel } from '../../home/composer-words.ts';
import { useSearchIndex } from '../../search/queries.ts';
import { useTicketDialogStore } from '../../tickets/ticket-dialog-store.ts';
import { briefNote, contextWords } from '../ticket-tab-words.ts';
import { TicketPanel } from './ticket-panel.tsx';

/** Everything Claude was sent; a session saved before Orynx kept that list has its ticket alone. */
export function contextOf(session: Session): ComposerChip[] {
  if (session.context.length > 0) return session.context;
  return session.source?.kind === 'jira' ? [{ kind: 'jira', key: session.source.key }] : [];
}

/** The second line, as the composer's context dialog says it: a ticket's title and status, a PR's title, a path. */
function useSubLine(): (chip: ComposerChip) => string | null {
  const index = useSearchIndex();
  return (chip) => {
    if (chip.kind === 'jira') {
      const ticket = index.data?.tickets.find((known) => known.key === chip.key);
      return ticket === undefined ? null : `${ticket.title} · ${ticket.status}`;
    }
    if (chip.kind === 'pull_request') {
      const id = `${chip.owner}/${chip.name}#${String(chip.number)}`.toLowerCase();
      return index.data?.pullRequests.find((known) => known.id.toLowerCase() === id)?.title ?? null;
    }
    return chip.path;
  };
}

function Name({ chip }: { chip: ComposerChip }) {
  const platform = usePlatform();
  const showTicket = useTicketDialogStore((state) => state.show);
  const label = chipLabel(chip);
  if (chip.kind === 'jira') {
    return (
      <AttentionTitleButton
        onClick={() => {
          showTicket({ key: chip.key, title: null, type: null, url: null });
        }}
      >
        {label}
      </AttentionTitleButton>
    );
  }
  if (chip.kind === 'pull_request') {
    return (
      <ExternalLink
        href={`https://github.com/${chip.owner}/${chip.name}/pull/${String(chip.number)}`}
        onOpen={(href) => {
          platform.openExternal(href);
        }}
        size="body"
        className="w-fit max-w-full font-medium"
      >
        {label}
      </ExternalLink>
    );
  }
  return <span className="truncate font-medium">{label}</span>;
}

/**
 * The Context tab (the user's call, 19 Oct 2026, in place of spec 013's Ticket tab): the session's own ticket as
 * the Ticket tab showed it, then every ticket, pull request and file Claude was sent. A ticket's key opens the
 * ticket dialog and a pull request opens on GitHub.
 */
export function ContextPanel({ session }: { session: Session }) {
  const subLine = useSubLine();
  return (
    <div className="flex max-w-160 min-w-0 flex-col gap-4">
      {session.source?.kind === 'jira' ? <TicketPanel session={session} /> : null}
      <AttentionList aria-label={contextWords.list}>
        {contextOf(session).map((chip) => {
          const sub = subLine(chip);
          return (
            <li key={`${chip.kind}:${chipLabel(chip)}`} className="group flex min-h-14 items-center gap-3 py-2.5">
              {chip.kind === 'file' ? (
                <Icon icon={File01Icon} aria-hidden className="text-muted-foreground" />
              ) : (
                <SourceMark source={chip.kind === 'jira' ? ticketSource(chip.key) : 'github'} label="none" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Name chip={chip} />
                {sub === null ? null : <span className="truncate text-small text-muted-foreground">{sub}</span>}
              </div>
              {/* A file's path can be copied, as every path on this screen (the user's call, 19 Oct 2026). */}
              {chip.kind === 'file' ? <CopyButton text={chip.path} reveal="hover" /> : null}
            </li>
          );
        })}
      </AttentionList>
      {session.ticket === null ? null : (
        <Callout tone="info" title={briefNote.title}>
          {briefNote.body}
        </Callout>
      )}
    </div>
  );
}
