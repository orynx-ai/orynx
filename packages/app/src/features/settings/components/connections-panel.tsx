import type { ConnectionState, IntegrationId, IntegrationStatus } from '@devhub/contracts';
import { Callout, Pill, SourceMark, type PillTone } from '@devhub/ui';
import { useStatus } from '../queries.ts';

const integrations: readonly { id: IntegrationId; name: string; howToConnect: string }[] = [
  { id: 'jira', name: 'Jira', howToConnect: 'Connect with your site address, email and a personal API token.' },
  { id: 'github', name: 'GitHub', howToConnect: 'Reuses your gh command-line login, or a personal access token.' },
  { id: 'slack', name: 'Slack', howToConnect: 'Reading your mentions needs a Slack app your admin approves.' },
];

const stateLabels: Record<ConnectionState, { tone: PillTone; label: string }> = {
  connected: { tone: 'success', label: 'Connected' },
  not_connected: { tone: 'neutral', label: 'Not connected' },
  needs_admin_approval: { tone: 'warning', label: 'Needs admin approval' },
  error: { tone: 'danger', label: 'Error' },
};

/** Settings › Connections: one row per tool with its state in a word, never colour alone. */
export function ConnectionsPanel() {
  const status = useStatus();

  if (status.isError) {
    return (
      <Callout tone="warning" role="alert" title="Could not reach the DevHub server">
        <span>Check that DevHub is still running in your terminal, then reload the page.</span>
      </Callout>
    );
  }

  return (
    <ul
      aria-label="Connections"
      className="m-0 list-none divide-y divide-border rounded-md border border-border bg-raised p-0"
    >
      {integrations.map((integration) => (
        <ConnectionRow
          key={integration.id}
          id={integration.id}
          name={integration.name}
          howToConnect={integration.howToConnect}
          status={status.data?.integrations[integration.id]}
        />
      ))}
    </ul>
  );
}

function ConnectionRow({
  id,
  name,
  howToConnect,
  status,
}: {
  id: IntegrationId;
  name: string;
  howToConnect: string;
  /** Undefined while loading: the row keeps its size so nothing shifts when data arrives. */
  status: IntegrationStatus | undefined;
}) {
  const state = status ? stateLabels[status.state] : null;
  return (
    <li className="flex items-center gap-4 p-4">
      <SourceMark source={id} size="lg" label="none" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{name}</span>
          {state ? (
            <Pill tone={state.tone}>{state.label}</Pill>
          ) : (
            <Pill tone="neutral" aria-busy>
              Checking
            </Pill>
          )}
        </div>
        <span className="text-small text-muted-foreground">{status?.detail ?? howToConnect}</span>
      </div>
    </li>
  );
}
