import type { IntegrationStatus } from '@devhub/contracts';
import { useConnectionChangeRunning, useGitHubConnection } from '../queries.ts';
import { GitHubConnectionForm } from './github-connection-form.tsx';
import { ManagedConnectionRow, type RowControls } from './managed-connection-row.tsx';

export interface GitHubConnectionRowProps extends RowControls {
  status: IntegrationStatus | undefined;
}

/** The GitHub row: Connect or Manage opens the form inside the row (spec 004, Q4). */
export function GitHubConnectionRow({ status, ...controls }: GitHubConnectionRowProps) {
  const connection = useGitHubConnection();
  const changing = useConnectionChangeRunning();

  // Until the saved way arrives, the status says whether anything is set up.
  const configured = connection.data
    ? connection.data.saved !== null
    : (status?.state ?? 'not_connected') !== 'not_connected';
  const loaded = connection.data;

  return (
    <ManagedConnectionRow
      id="github"
      name="GitHub"
      howToConnect="Reuses your gh command-line login, or a personal access token."
      status={status}
      configured={configured}
      changing={changing}
      loadFailed={connection.isLoadingError}
      {...controls}
      form={
        loaded
          ? ({ id, close }) => (
              <GitHubConnectionForm
                id={id}
                connection={loaded}
                onConnected={() => {
                  close('GitHub is connected.');
                }}
                onDisconnected={() => {
                  close('GitHub is disconnected.');
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
