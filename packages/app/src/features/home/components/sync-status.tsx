import { Rotate01Icon } from '@hugeicons/core-free-icons';
import { Button, cn, Icon } from '@devhub/ui';
import { SyncActivityButton } from '../../sync-activity/components/sync-activity-button.tsx';
import { syncLine } from '../inbox-words.ts';
import { useInbox, useRefreshInbox } from '../queries.ts';
import { useNow } from '../use-now.ts';

/**
 * Refresh: one sync of Jira and GitHub now, which also reads Tickets' sprint. Home's page bar has it, and Tickets'
 * (the user's call, 19 Oct 2026).
 */
export function RefreshButton() {
  const refresh = useRefreshInbox();
  const syncing = refresh.isPending;
  return (
    // The arrow turns while the sync runs: Button's own `pending` would add a second icon beside it.
    <Button
      variant="ghost"
      size="sm"
      aria-disabled={syncing || undefined}
      onClick={() => {
        if (!syncing) refresh.mutate();
      }}
    >
      <Icon icon={Rotate01Icon} aria-hidden className={cn(syncing && 'motion-safe:animate-spin')} />
      Refresh
    </Button>
  );
}

/**
 * The right of Home's page bar (spec 007, Q8c): when the list last synced, moving on each minute, Sync activity
 * (spec 035) and Refresh. Neither shows until a tool is connected (AC-21). Under 768 px the line steps aside, as page bar
 * meta does.
 */
export function SyncStatus() {
  const inbox = useInbox();
  const now = useNow();
  if (inbox.data === undefined) return null;
  const { tools } = inbox.data;
  if (tools.jira.state === 'not_connected' && tools.github.state === 'not_connected') return null;

  const line = syncLine(inbox.data, now);
  const attention = [tools.jira, tools.github].filter((tool) => tool.state === 'failed').length;
  return (
    <>
      {line === null ? null : <span className="text-small text-muted-foreground max-md:hidden">{line}</span>}
      <SyncActivityButton attention={attention} />
      <RefreshButton />
    </>
  );
}
