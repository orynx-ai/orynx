import type { RefObject } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { Session } from '@devhub/contracts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@devhub/ui';
import { useSessionChanges } from '../queries.ts';
import { sourceLabel } from '../source-label.ts';
import { ChangesPanel } from './changes-panel.tsx';
import { TicketPanel } from './ticket-panel.tsx';

/** The number of changed files for the Changes tab: null while they load, none when they couldn't be read. */
function useChangedCount(sessionId: string): number | null | undefined {
  const changes = useSessionChanges(sessionId);
  if (changes.isPending) return null;
  if (changes.isError) return undefined;
  return changes.data.state === 'ready' ? changes.data.files.length + changes.data.moreFiles : 0;
}

/**
 * The right pane (spec 013, `session.html`'s "Work details"): the Changes and Ticket tabs, the one open kept in
 * the address (`?tab=ticket`), Changes by default. A session with no ticket has Changes alone (spec 015).
 */
export function SessionDetails({ session, title }: { session: Session; title: RefObject<HTMLHeadingElement | null> }) {
  const { tab } = useSearch({ from: '/sessions/$sessionId' });
  const navigate = useNavigate({ from: '/sessions/$sessionId' });
  const count = useChangedCount(session.id);
  const key = sourceLabel(session.source);
  // A session with no ticket has nothing for the Ticket tab (spec 015, Q8d).
  const ticket = session.source?.kind === 'jira';
  return (
    <Tabs
      value={ticket && tab === 'ticket' ? 'ticket' : 'changes'}
      onValueChange={(next) => {
        void navigate({
          search: (search) => ({ ...search, tab: next === 'ticket' ? 'ticket' : undefined }),
          replace: true,
        });
      }}
    >
      <TabsList aria-label="Session details">
        <TabsTrigger value="changes" {...(count === undefined ? {} : { count })}>
          Changes
        </TabsTrigger>
        {ticket ? (
          <TabsTrigger value="ticket" {...(key === undefined ? {} : { count: key })}>
            Ticket
          </TabsTrigger>
        ) : null}
      </TabsList>
      <TabsContent value="changes" className="pt-3">
        <ChangesPanel session={session} title={title} />
      </TabsContent>
      {ticket ? (
        <TabsContent value="ticket" className="pt-3">
          <TicketPanel session={session} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
