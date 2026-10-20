import type { InboxSource, SyncRun } from '@devhub/contracts';
import {
  CopyButton,
  ExternalLink,
  HistoryList,
  HistoryRow,
  SegmentedControl,
  SegmentedControlItem,
  Skeleton,
  cn,
} from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { useNow } from '../../../words/use-now.ts';
import { useSyncActivity } from '../queries.ts';
import { changeKinds, problemWords, runSummary, timeText, toolNames, tookText } from '../sync-words.ts';

export type HistoryShow = 'all' | 'failed';

/**
 * The detail's History (spec 035): the newest runs of the picked tool, or of every tool, each opening to what it
 * found or what went wrong. All or Failed picks which.
 */
export function SyncHistory({
  tool,
  show,
  onShowChange,
}: {
  tool: InboxSource | undefined;
  show: HistoryShow;
  onShowChange: (show: HistoryShow) => void;
}) {
  const now = useNow();
  const history = useSyncActivity({ ...(tool === undefined ? {} : { tool }), show });
  const runs = history.data?.runs;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <h4 className="m-0 flex-1 text-small font-medium">History</h4>
        <SegmentedControl
          aria-label="Show"
          value={show}
          onValueChange={(value) => {
            onShowChange(value === 'failed' ? 'failed' : 'all');
          }}
        >
          <SegmentedControlItem value="all">All</SegmentedControlItem>
          <SegmentedControlItem value="failed">Failed</SegmentedControlItem>
        </SegmentedControl>
      </div>
      {runs === undefined ? (
        <div aria-hidden className="flex flex-col gap-2 border-t border-border pt-3">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-5 w-full" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <p className="m-0 border-t border-border py-5 text-center text-small text-muted-foreground">
          {show === 'failed' ? 'No failed syncs here.' : 'No syncs yet.'}
        </p>
      ) : (
        <HistoryList aria-label="Sync history">
          {runs.map((run) => (
            <HistoryRow
              key={run.id}
              tone={run.problem === null ? 'success' : 'danger'}
              time={timeText(run.startedAt, now)}
              {...(tool === undefined ? { lead: toolNames[run.tool] } : {})}
              summary={runSummary(run)}
              summaryTone={
                run.problem !== null ? 'danger' : run.changes.length + run.moreChanges === 0 ? 'muted' : 'default'
              }
              duration={tookText(run.tookMs)}
              status={run.problem === null ? 'succeeded' : 'failed'}
            >
              <RunDetail run={run} />
            </HistoryRow>
          ))}
        </HistoryList>
      )}
    </div>
  );
}

/** What an opened row holds: each change with a link to it, or what went wrong. */
function RunDetail({ run }: { run: SyncRun }) {
  const platform = usePlatform();
  if (run.problem !== null) {
    const line = problemWords(run.tool, run.problem).title;
    return (
      <div className="flex items-center gap-2 rounded-sm bg-sidebar px-2.5 py-1">
        <span className="min-w-0 flex-1 font-mono text-label break-all">{line}</span>
        <CopyButton text={line} label="Copy the error" size="sm" />
      </div>
    );
  }
  if (run.changes.length === 0) {
    return <span className="text-muted-foreground">Checked everything. Nothing changed.</span>;
  }
  return (
    <>
      {run.changes.map((change) => (
        <div key={`${change.kind} ${change.ref}`} className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'w-16 shrink-0 text-label font-medium',
              change.kind === 'new' ? 'text-info-foreground' : 'text-muted-foreground',
            )}
          >
            {changeKinds[change.kind]}
          </span>
          <span className="shrink-0 font-mono text-label">{change.ref}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{change.title}</span>
          <ExternalLink
            href={change.url}
            aria-label={`Open ${change.ref}`}
            onOpen={(href) => {
              platform.openExternal(href);
            }}
          >
            Open
          </ExternalLink>
        </div>
      ))}
      {run.moreChanges > 0 ? <span className="text-muted-foreground">and {run.moreChanges} more</span> : null}
    </>
  );
}
