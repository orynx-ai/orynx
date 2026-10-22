import { useState } from 'react';
import { ArrowExpand01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { Session } from '@devhub/contracts';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Icon,
  IconButton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@devhub/ui';
import { portWords } from '../port-words.ts';
import { useSessionChanges, useSessionPorts } from '../queries.ts';
import { contextWords } from '../ticket-tab-words.ts';
import { ChangesPanel } from './changes-panel.tsx';
import { ContextPanel, contextOf } from './context-panel.tsx';
import { PortsPanel } from './ports-panel.tsx';

/** The number of changed files for the Changes tab: null while they load, none when they couldn't be read. */
function useChangedCount(sessionId: string): number | null | undefined {
  const changes = useSessionChanges(sessionId);
  if (changes.isPending) return null;
  if (changes.isError) return undefined;
  return changes.data.state === 'ready' ? changes.data.files.length + changes.data.moreFiles : 0;
}

/**
 * The right pane (spec 013, `session.html`'s "Work details"): the Ports (spec 042), Changes and Context tabs, the one
 * you picked kept in the address (`?tab=ports`), else Ports for a run session and Changes for any other. A session that was sent nothing has Changes alone (spec 015).
 * Side by side with the progress, it stays in view and scrolls on its own; Full screen shows the open tab in a
 * dialog that fills the window (the user's call, 19 Oct 2026).
 */
export function SessionDetails({ session }: { session: Session }) {
  const { tab } = useSearch({ from: '/sessions/$sessionId' });
  const navigate = useNavigate({ from: '/sessions/$sessionId' });
  const count = useChangedCount(session.id);
  const [full, setFull] = useState(false);
  const items = contextOf(session).length;
  // An Ask session changes nothing, so it has Context alone (spec 026).
  const ask = session.mode === 'ask';
  // Ports, first, where Orynx can find a session's servers: a Build with a worktree, not on Windows (spec 042).
  const ports = session.terminal;
  const listening = useSessionPorts(session).data?.length ?? 0;
  // The tab you picked, or Ports for a run session and Changes for any other (spec 042, Q9); never switched for you.
  const fallback = ports && session.intent === 'run' ? 'ports' : 'changes';
  const picked = (tab === 'ports' && ports) || (tab === 'context' && items > 0) || tab === 'changes' ? tab : undefined;
  const shown = ask ? 'context' : (picked ?? fallback);
  const changes = <ChangesPanel session={session} />;
  const context = <ContextPanel session={session} />;
  const portsPanel = <PortsPanel session={session} />;
  const titles = { ports: portWords.tab, changes: 'Changes', context: contextWords.tab };
  const panels = { ports: portsPanel, changes, context };
  return (
    <>
      <Tabs
        value={shown}
        onValueChange={(next) => {
          void navigate({
            search: (search) => ({
              ...search,
              // Only a pick that isn't the session's own default goes in the address.
              tab:
                (next === 'context' || next === 'ports' || next === 'changes') && next !== fallback ? next : undefined,
            }),
            replace: true,
          });
        }}
        className="flex min-h-0 flex-col"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border">
          <TabsList aria-label="Session details" className="min-w-0 flex-1 border-b-0">
            {ports ? (
              <TabsTrigger value="ports" {...(listening === 0 ? {} : { count: listening })}>
                {portWords.tab}
              </TabsTrigger>
            ) : null}
            {ask ? null : (
              <TabsTrigger value="changes" {...(count === undefined ? {} : { count })}>
                Changes
              </TabsTrigger>
            )}
            {items > 0 ? (
              <TabsTrigger value="context" count={items}>
                {contextWords.tab}
              </TabsTrigger>
            ) : null}
          </TabsList>
          <IconButton
            variant="ghost"
            size="sm"
            label={contextWords.fullScreen}
            onClick={() => {
              setFull(true);
            }}
          >
            <Icon icon={ArrowExpand01Icon} aria-hidden />
          </IconButton>
        </div>
        {/* Each tab scrolls on its own while the pane is held in view; relative, so hidden words in it are clipped there. */}
        {ports ? (
          <TabsContent value="ports" className="relative min-h-0 overflow-y-auto pt-3">
            {portsPanel}
          </TabsContent>
        ) : null}
        {ask ? null : (
          <TabsContent value="changes" className="relative min-h-0 overflow-y-auto pt-3">
            {changes}
          </TabsContent>
        )}
        {items > 0 ? (
          <TabsContent value="context" className="relative min-h-0 overflow-y-auto pt-3">
            {context}
          </TabsContent>
        ) : null}
      </Tabs>
      <Dialog open={full} onOpenChange={setFull}>
        {full ? (
          <DialogContent
            size="full"
            onOpenAutoFocus={(event) => {
              // Focus on the dialog, not on Close: Close's tooltip would take the first Esc, as the ticket dialog's.
              event.preventDefault();
              if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
            }}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-6 py-3">
              <DialogTitle className="min-w-0 flex-1 truncate">{titles[shown]}</DialogTitle>
              <IconButton
                variant="ghost"
                size="sm"
                label={contextWords.close}
                onClick={() => {
                  setFull(false);
                }}
              >
                <Icon icon={Cancel01Icon} aria-hidden />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{panels[shown]}</div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
