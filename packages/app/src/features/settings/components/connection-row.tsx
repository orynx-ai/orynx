import type { ReactNode } from 'react';
import type { ConnectionState, IntegrationId, IntegrationStatus } from '@devhub/contracts';
import { Pill, SourceMark, type PillTone } from '@devhub/ui';

const stateLabels: Record<ConnectionState, { tone: PillTone; label: string }> = {
  connected: { tone: 'success', label: 'Connected' },
  not_connected: { tone: 'neutral', label: 'Not connected' },
  needs_admin_approval: { tone: 'warning', label: 'Needs admin approval' },
  error: { tone: 'danger', label: 'Error' },
};

export interface ConnectionRowProps {
  id: IntegrationId;
  name: string;
  howToConnect: string;
  /** Undefined while loading: the row keeps its size so nothing shifts when data arrives. */
  status: IntegrationStatus | undefined;
  /** The row's button, such as Connect or Manage. */
  action?: ReactNode;
  /** Shown under the row, inside it: no box inside the box. */
  children?: ReactNode;
}

/** One tool in Settings › Connections, with its state in a word, never colour alone. */
export function ConnectionRow({ id, name, howToConnect, status, action, children }: ConnectionRowProps) {
  const state = status ? stateLabels[status.state] : null;
  return (
    <li className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-4">
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
        {action}
      </div>
      {children}
    </li>
  );
}
