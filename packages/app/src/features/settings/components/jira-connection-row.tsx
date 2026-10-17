import type { IntegrationStatus } from '@devhub/contracts';
import { useJiraChangeRunning, useJiraConnection } from '../queries.ts';
import { JiraConnectionForm } from './jira-connection-form.tsx';
import { ManagedConnectionRow } from './managed-connection-row.tsx';

export interface JiraConnectionRowProps {
  status: IntegrationStatus | undefined;
  /** Says a message politely, through the Connections panel's live region. */
  announce: (message: string) => void;
}

/** The Jira row: Connect or Manage opens the form inside the row (spec 003, Q3). */
export function JiraConnectionRow({ status, announce }: JiraConnectionRowProps) {
  const connection = useJiraConnection();
  const changing = useJiraChangeRunning();

  // Until the saved settings arrive, the status says whether anything is set up.
  const configured = connection.data
    ? connection.data.saved !== null
    : (status?.state ?? 'not_connected') !== 'not_connected';
  const saved = connection.data;

  return (
    <ManagedConnectionRow
      id="jira"
      name="Jira"
      howToConnect="Connect with your site address, email and a personal API token."
      status={status}
      configured={configured}
      changing={changing}
      loadFailed={connection.isLoadingError}
      announce={announce}
      form={
        saved
          ? ({ id, close }) => (
              <JiraConnectionForm
                id={id}
                connection={saved}
                onConnected={() => {
                  close('Jira is connected.');
                }}
                onDisconnected={() => {
                  close('Jira is disconnected.');
                }}
                onCancel={() => {
                  close();
                }}
              />
            )
          : undefined
      }
    />
  );
}
