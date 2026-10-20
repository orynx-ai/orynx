// Design: docs/design/screens/sync-activity/SyncAudit.dc.html — the modal: head, tool list, detail with its problem callout and stats, history, foot
import { Cancel01Icon, Loading03Icon, Menu01Icon } from '@hugeicons/core-free-icons';
import { Link } from '@tanstack/react-router';
import { useId, useState, type ReactNode } from 'react';
import type { InboxSource, SyncTool } from '@devhub/contracts';
import { syncActivityLimits } from '@devhub/contracts';
import {
  Button,
  Callout,
  DialogContent,
  DialogFoot,
  DialogTitle,
  Icon,
  IconButton,
  ListNav,
  ListNavGroup,
  ListNavItem,
  ListNavSkeleton,
  Skeleton,
  SourceMark,
  StatTiles,
  StatusDot,
} from '@devhub/ui';
import { useNow } from '../../../words/use-now.ts';
import { useSyncActivity, useSyncing, useSyncNow } from '../queries.ts';
import {
  activityHeadline,
  failingLine,
  problemWords,
  statusLine,
  syncStats,
  toolLine,
  toolNames,
} from '../sync-words.ts';
import { SyncHistory, type HistoryShow } from './sync-history.tsx';

type Pick = InboxSource | 'all';

const groups = [
  { label: 'Needs attention', holds: (tool: SyncTool) => tool.state.state === 'failed' },
  { label: 'Syncing fine', holds: (tool: SyncTool) => tool.state.state === 'synced' || tool.state.state === 'syncing' },
  { label: 'Not connected', holds: (tool: SyncTool) => tool.state.state === 'not_connected' },
];

/** What a screen reader hears when a sync ends: "Jira synced. GitHub still failing." */
function outcome(tools: readonly SyncTool[], synced: readonly InboxSource[]): string {
  return synced
    .map((name) => {
      const failing = tools.find((tool) => tool.tool === name)?.state.state === 'failed';
      return `${toolNames[name]} ${failing ? 'still failing' : 'synced'}.`;
    })
    .join(' ');
}

const foot = `Syncs every ${String(syncActivityLimits.everyMinutes)} min while Orynx is open · log kept on this computer for ${String(syncActivityLimits.keptDays)} days`;

/**
 * The Sync activity modal (spec 035): every tool's state on the left, problems first, and the picked tool's
 * status, problem, stats and history on the right. It opens on the first tool that needs attention, or on All
 * activity when none does. Under 768 px the list sits above the detail and the whole body scrolls (Q2).
 */
export function SyncActivityDialog({ onClose }: { onClose: () => void }) {
  const headlineId = useId();
  const detailId = useId();
  const [picked, setPicked] = useState<Pick | null>(null);
  const [show, setShow] = useState<HistoryShow>('all');
  const [said, setSaid] = useState('');
  const summary = useSyncActivity({ show: 'all' });
  const syncAll = useSyncNow();
  const tools = summary.data?.tools ?? [];
  const pick: Pick = picked ?? tools.find((tool) => tool.state.state === 'failed')?.tool ?? 'all';
  const current = pick === 'all' ? undefined : tools.find((tool) => tool.tool === pick);
  const connected = tools.filter((tool) => tool.state.state !== 'not_connected').map((tool) => tool.tool);

  function choose(next: Pick) {
    setPicked(next);
    // Another tool's history starts from every run again (AC-18).
    setShow('all');
  }

  return (
    <DialogContent size="wide" aria-describedby={summary.data === undefined ? undefined : headlineId}>
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <DialogTitle className="m-0 text-body font-medium">Sync activity</DialogTitle>
          {summary.data === undefined ? null : (
            <p id={headlineId} className="m-0 text-small text-muted-foreground">
              {activityHeadline(tools)}
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          pending={syncAll.isPending}
          onClick={() => {
            setSaid(connected.map((name) => `${toolNames[name]} syncing.`).join(' '));
            syncAll.mutate(undefined, {
              onSuccess: (fresh) => {
                setSaid(outcome(fresh, connected));
              },
            });
          }}
        >
          {syncAll.isPending ? 'Syncing…' : 'Sync all now'}
        </Button>
        <IconButton variant="ghost" size="sm" label="Close sync activity" onClick={onClose}>
          <Icon icon={Cancel01Icon} aria-hidden />
        </IconButton>
      </div>

      {summary.isError ? (
        <div className="flex flex-1 flex-col items-start gap-3 p-6">
          <p className="m-0 text-small">Sync activity didn’t load.</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void summary.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          <div className="shrink-0 border-border bg-sidebar p-2 max-md:border-b md:w-70 md:overflow-y-auto md:border-e">
            {summary.data === undefined ? (
              <ListNavSkeleton rows={3} search={false} />
            ) : (
              <ListNav aria-label="Tools" className="p-0">
                <ListNavItem
                  label="All activity"
                  current={pick === 'all'}
                  mark={
                    <span className="flex size-6 items-center justify-center rounded-sm bg-subtle text-muted-foreground">
                      <Icon icon={Menu01Icon} className="size-3.5" />
                    </span>
                  }
                  onClick={() => {
                    choose('all');
                  }}
                />
                {groups.map(({ label, holds }) => {
                  const held = tools.filter(holds);
                  if (held.length === 0) return null;
                  return (
                    <ListNavGroup key={label} label={label} count={held.length}>
                      {held.map((tool) => (
                        <ToolItem
                          key={tool.tool}
                          tool={tool}
                          current={pick === tool.tool}
                          onPick={() => {
                            choose(tool.tool);
                          }}
                        />
                      ))}
                    </ListNavGroup>
                  );
                })}
              </ListNav>
            )}
          </div>

          <section aria-labelledby={detailId} className="flex min-w-0 flex-1 flex-col md:overflow-y-auto">
            <div className="flex flex-col gap-5 px-6 pt-5 pb-7">
              {summary.data === undefined ? (
                <div aria-hidden className="flex flex-col gap-3">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-5 w-64" />
                </div>
              ) : current === undefined ? (
                <div className="flex flex-col gap-0.5">
                  <h3 id={detailId} className="m-0 text-body font-medium">
                    All activity
                  </h3>
                  <span className="text-small text-muted-foreground">
                    Every sync from your {tools.filter((tool) => tool.state.state !== 'not_connected').length} connected
                    tools, newest first
                  </span>
                </div>
              ) : (
                <ToolDetail tool={current} headingId={detailId} announce={setSaid} />
              )}
              {summary.data === undefined || current?.state.state === 'not_connected' ? null : (
                <SyncHistory tool={current?.tool} show={show} onShowChange={setShow} />
              )}
              <div role="status" className="sr-only">
                {said}
              </div>
            </div>
          </section>
        </div>
      )}

      <DialogFoot start={<span className="text-small text-muted-foreground">{foot}</span>}>
        <Button variant="primary" size="sm" onClick={onClose}>
          Done
        </Button>
      </DialogFoot>
    </DialogContent>
  );
}

/** A tool in the list: its mark, name, line and dot, or a spinner while this page syncs it. */
function ToolItem({ tool, current, onPick }: { tool: SyncTool; current: boolean; onPick: () => void }) {
  const line = toolLine(tool);
  const syncing = useSyncing(tool.tool);
  return (
    <ListNavItem
      label={
        <>
          {toolNames[tool.tool]}
          <span className="sr-only">, {line.state}</span>
        </>
      }
      description={<span className={tool.state.state === 'failed' ? 'text-danger' : undefined}>{line.line}</span>}
      mark={<SourceMark source={tool.tool} />}
      status={
        syncing ? (
          <Icon icon={Loading03Icon} className="size-3 text-muted-foreground motion-safe:animate-spin" />
        ) : (
          <StatusDot tone={line.tone} />
        )
      }
      current={current}
      onClick={onPick}
    />
  );
}

/** Settings › Connections with the tool's dialog open; leaving Home closes this modal (AC-23). */
function ConnectLink({ tool, children }: { tool: InboxSource; children: ReactNode }) {
  return (
    <Button asChild variant="primary" size="sm">
      <Link to="/settings/$tab" params={{ tab: 'connections' }} search={{ tool }}>
        {children}
      </Link>
    </Button>
  );
}

/** One tool's head, with Sync now, its problem with Retry, and its stats. */
function ToolDetail({
  tool,
  headingId,
  announce,
}: {
  tool: SyncTool;
  headingId: string;
  announce: (said: string) => void;
}) {
  const now = useNow();
  const sync = useSyncNow(tool.tool);
  const line = toolLine(tool);
  const problem = tool.state.state === 'failed' ? problemWords(tool.tool, tool.state.problem) : null;
  const name = toolNames[tool.tool];
  function syncNow() {
    announce(`${name} syncing.`);
    sync.mutate(undefined, {
      onSuccess: (fresh) => {
        announce(outcome(fresh, [tool.tool]));
      },
    });
  }
  return (
    <>
      <div className="flex items-center gap-3">
        <SourceMark source={tool.tool} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 id={headingId} className="m-0 text-body font-medium">
            {toolNames[tool.tool]}
          </h3>
          <span className="inline-flex items-center gap-1.5 text-small text-muted-foreground">
            <StatusDot tone={line.tone} />
            {statusLine(tool)}
          </span>
        </div>
        {tool.state.state === 'not_connected' ? <ConnectLink tool={tool.tool}>Connect {name}</ConnectLink> : null}
        {problem === null && tool.state.state !== 'not_connected' ? (
          <Button variant="secondary" size="sm" pending={sync.isPending} onClick={syncNow}>
            {sync.isPending ? 'Syncing…' : 'Sync now'}
          </Button>
        ) : null}
      </div>
      {problem === null ? null : (
        <Callout
          role="alert"
          tone={problem.tone}
          title={problem.title}
          actions={
            <>
              {problem.reconnect ? <ConnectLink tool={tool.tool}>Reconnect</ConnectLink> : null}
              <Button variant="secondary" size="sm" pending={sync.isPending} onClick={syncNow}>
                Retry
              </Button>
            </>
          }
        >
          <span className="text-small">{problem.fix}</span>
          <span className="text-label text-muted-foreground">{failingLine(tool)}</span>
        </Callout>
      )}
      {tool.state.state === 'not_connected' ? null : <StatTiles items={syncStats(tool, now)} />}
    </>
  );
}
