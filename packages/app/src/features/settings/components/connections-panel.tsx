import { useId, useState, type ReactNode } from 'react';
import { Plug01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import type { IntegrationId, IntegrationStatus } from '@devhub/contracts';
import { Callout, Icon, Panel, Skeleton, SourceMark, StatusSign, type StatusButtonState } from '@devhub/ui';
import { useStatus } from '../queries.ts';
import { GitHubConnectionDialog, JiraConnectionDialog, SlackConnectionDialog } from './connection-dialog.tsx';
import { howToConnect, lookOf, lookWords, toolNames } from './connection-words.ts';
import { SectionHeading } from './section-heading.tsx';
import { ServerUnreachable } from './server-unreachable.tsx';

/** One tool: its mark, name and line, and the status button that opens its dialog (spec 030). */
function ConnectionRow({
  tool,
  status,
  children,
}: {
  tool: IntegrationId;
  /** Undefined while loading: the row keeps its size, with a round placeholder for the button (Q7). */
  status: IntegrationStatus | undefined;
  /** The status button and its dialog. */
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3.5 px-4 py-3.5">
      <SourceMark source={tool} size="lg" label="none" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{toolNames[tool]}</span>
        <span className="truncate text-small text-muted-foreground">{status?.detail ?? howToConnect[tool]}</span>
      </div>
      {status === undefined ? <Skeleton shape="circle" className="size-9" /> : children}
    </li>
  );
}

/**
 * The page bar on Settings › Connections: "2 of 3 connected · 1 needs attention" (spec 030). Empty until the
 * status comes, and under 768 px, where the bar has room only for the crumbs.
 */
export function ConnectionsSummary() {
  const tools = useStatus().data?.integrations;
  if (tools === undefined) return null;
  const states = Object.values(tools).map((tool) => lookOf(tool));
  const connected = states.filter((look) => look === 'connected').length;
  const attention = states.filter((look) => look === 'needs_reconnecting').length;
  return (
    <span className="text-small text-muted-foreground max-md:hidden">
      {`${String(connected)} of ${String(states.length)} connected`}
      {attention === 0 ? null : ` · ${String(attention)} needs attention`}
    </span>
  );
}

const keyOrder: StatusButtonState[] = ['connected', 'needs_reconnecting', 'not_connected'];

/** Settings › Connections: each tool's state at a glance, everything else in its dialog (spec 030). */
export function ConnectionsPanel() {
  const status = useStatus();
  const headingId = useId();
  // What the last change did, under the key until the next one: "Jira disconnected." (spec 030).
  const [changed, setChanged] = useState('');

  if (status.isError) return <ServerUnreachable />;
  const tools = status.data?.integrations;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3.5">
      <SectionHeading
        id={headingId}
        icon={Plug01Icon}
        title="Your tools"
        line="Orynx uses your own logins, so it never sees more than you can. Select a status to manage it."
      />
      <Panel>
        <ul
          aria-label="Connections"
          aria-busy={tools === undefined || undefined}
          className="m-0 list-none divide-y divide-border p-0"
        >
          <ConnectionRow tool="jira" status={tools?.jira}>
            {tools ? <JiraConnectionDialog status={tools.jira} announce={setChanged} /> : null}
          </ConnectionRow>
          <ConnectionRow tool="github" status={tools?.github}>
            {tools ? <GitHubConnectionDialog status={tools.github} announce={setChanged} /> : null}
          </ConnectionRow>
          <ConnectionRow tool="slack" status={tools?.slack}>
            {tools ? <SlackConnectionDialog status={tools.slack} /> : null}
          </ConnectionRow>
        </ul>
      </Panel>
      <ul aria-label="Status key" className="m-0 flex list-none flex-wrap gap-4 p-0 text-label text-muted-foreground">
        {keyOrder.map((look) => (
          <li key={look} className="inline-flex items-center gap-1.5">
            <StatusSign state={look} />
            {lookWords[look].label}
          </li>
        ))}
      </ul>
      {/* There from the start, so a screen reader hears each new line. */}
      <div role="status">
        {changed === '' ? null : (
          <Callout tone="success" title={changed} icon={<Icon icon={Tick02Icon} className="text-success" />} />
        )}
      </div>
    </section>
  );
}
