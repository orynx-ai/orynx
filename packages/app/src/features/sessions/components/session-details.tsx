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
import { useSessionChanges } from '../queries.ts';
import { contextWords } from '../ticket-tab-words.ts';
import { ChangesPanel } from './changes-panel.tsx';
import { ContextPanel, contextOf } from './context-panel.tsx';

/** The number of changed files for the Changes tab: null while they load, none when they couldn't be read. */
function useChangedCount(sessionId: string): number | null | undefined {
  const changes = useSessionChanges(sessionId);
  if (changes.isPending) return null;
  if (changes.isError) return undefined;
  return changes.data.state === 'ready' ? changes.data.files.length + changes.data.moreFiles : 0;
}

/**
 * The right pane (spec 013, `session.html`'s "Work details"): the Changes and Context tabs, the one open kept in
 * the address (`?tab=context`), Changes by default. A session that was sent nothing has Changes alone (spec 015).
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
  const shown = ask || (items > 0 && tab === 'context') ? 'context' : 'changes';
  const changes = <ChangesPanel session={session} />;
  const context = <ContextPanel session={session} />;
  return (
    <>
      <Tabs
        value={shown}
        onValueChange={(next) => {
          void navigate({
            search: (search) => ({ ...search, tab: next === 'context' ? 'context' : undefined }),
            replace: true,
          });
        }}
        className="flex min-h-0 flex-col"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border">
          <TabsList aria-label="Session details" className="min-w-0 flex-1 border-b-0">
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
        {/* Each tab scrolls on its own while the pane is held in view. */}
        {ask ? null : (
          <TabsContent value="changes" className="min-h-0 overflow-y-auto pt-3">
            {changes}
          </TabsContent>
        )}
        {items > 0 ? (
          <TabsContent value="context" className="min-h-0 overflow-y-auto pt-3">
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
              <DialogTitle className="min-w-0 flex-1 truncate">
                {shown === 'context' ? contextWords.tab : 'Changes'}
              </DialogTitle>
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
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{shown === 'context' ? context : changes}</div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
