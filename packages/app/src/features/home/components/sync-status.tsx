import { Rotate01Icon } from '@hugeicons/core-free-icons';
import { cn, Icon, IconButton } from '@devhub/ui';
import { SyncActivityButton } from '../../sync-activity/components/sync-activity-button.tsx';
import { syncLine } from '../inbox-words.ts';
import { useInbox, useRefreshInbox } from '../queries.ts';
import { useNow } from '../use-now.ts';

/**
 * Sync: one sync of Jira and GitHub now, which also reads Tickets' sprint. Home's page bar has it, and Tickets'
 * (the user's call, 19 Oct 2026). It said Refresh until spec 039 (the user's call, 20 Oct 2026: "instead of refresh
 * use sync"), and it is its arrow alone, its word in the tooltip, so the page bar keeps to one line; while it runs it
 * says Syncing.
 */
export function SyncButton() {
  const refresh = useRefreshInbox();
  const syncing = refresh.isPending;
  return (
    // The arrow turns while the sync runs: IconButton's own `pending` would put a spinner in its place.
    <IconButton
      variant="ghost"
      size="sm"
      label={syncing ? 'Syncing' : 'Sync'}
      aria-disabled={syncing || undefined}
      onClick={() => {
        if (!syncing) refresh.mutate();
      }}
    >
      <Icon icon={Rotate01Icon} aria-hidden className={cn(syncing && 'motion-safe:animate-spin')} />
    </IconButton>
  );
}

/**
 * The right of Home's and Tickets' page bars (spec 007, Q8c): when the tools last synced, moving on each minute, as the
 * button that opens Sync activity (spec 039, Q2), then Sync. Neither shows until a tool is connected (AC-21).
 */
export function SyncStatus() {
  const inbox = useInbox();
  const now = useNow();
  if (inbox.data === undefined) return null;
  const { tools } = inbox.data;
  if (tools.jira.state === 'not_connected' && tools.github.state === 'not_connected') return null;

  const attention = [tools.jira, tools.github].filter((tool) => tool.state === 'failed').length;
  return (
    <>
      <SyncActivityButton attention={attention} line={syncLine(inbox.data, now)} />
      <SyncButton />
    </>
  );
}
