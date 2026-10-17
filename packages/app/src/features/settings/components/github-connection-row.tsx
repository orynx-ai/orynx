import type { IntegrationStatus } from '@devhub/contracts';
import { useGitHubChangeRunning, useGitHubConnection } from '../queries.ts';
import { GitHubConnectionForm } from './github-connection-form.tsx';
import { ManagedConnectionRow } from './managed-connection-row.tsx';

export interface GitHubConnectionRowProps {
  status: IntegrationStatus | undefined;
  /** Says a message politely, through the Connections panel's live region. */
  announce: (message: string) => void;
}

/** The GitHub row: Connect or Manage opens the form inside the row (spec 004, Q4). */
export function GitHubConnectionRow({ status, announce }: GitHubConnectionRowProps) {
  const connection = useGitHubConnection();
  const changing = useGitHubChangeRunning();

  // Until the saved way arrives, the status says whether anything is set up.
  const configured = connection.data
    ? connection.data.saved !== null
    : (status?.state ?? 'not_connected') !== 'not_connected';
  const saved = connection.data;

  return (
    <ManagedConnectionRow
      id="github"
      name="GitHub"
      howToConnect="Reuses your gh command-line login, or a personal access token."
      status={status}
      configured={configured}
      changing={changing}
      loadFailed={connection.isLoadingError}
      announce={announce}
      form={
        saved
          ? ({ id, close }) => (
              <GitHubConnectionForm
                id={id}
                connection={saved}
                onConnected={() => {
                  close('GitHub is connected.');
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
