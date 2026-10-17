import type { IntegrationStatus } from '@devhub/contracts';
import { useConnectionChangeRunning, useJiraConnection } from '../queries.ts';
import { JiraConnectionForm } from './jira-connection-form.tsx';
import { ManagedConnectionRow, type RowControls } from './managed-connection-row.tsx';

export interface JiraConnectionRowProps extends RowControls {
  status: IntegrationStatus | undefined;
}

/** The Jira row: Connect or Manage opens the form inside the row (spec 003, Q3). */
export function JiraConnectionRow({ status, ...controls }: JiraConnectionRowProps) {
  const connection = useJiraConnection();
  const changing = useConnectionChangeRunning();

  // Until the saved settings arrive, the status says whether anything is set up.
  const configured = connection.data
    ? connection.data.saved !== null
    : (status?.state ?? 'not_connected') !== 'not_connected';
  const loaded = connection.data;

  return (
    <ManagedConnectionRow
      id="jira"
      name="Jira"
      howToConnect="Connect with your site address, email and a personal API token."
      status={status}
      configured={configured}
      changing={changing}
      loadFailed={connection.isLoadingError}
      {...controls}
      form={
        loaded
          ? ({ id, close }) => (
              <JiraConnectionForm
                id={id}
                connection={loaded}
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
