import { useState } from 'react';
import { Callout } from '@devhub/ui';
import { useStatus } from '../queries.ts';
import { ConnectionRow } from './connection-row.tsx';
import { GitHubConnectionRow } from './github-connection-row.tsx';
import { JiraConnectionRow } from './jira-connection-row.tsx';

/** Settings › Connections: one row per tool with its state in a word, never colour alone. */
export function ConnectionsPanel() {
  const status = useStatus();
  // One polite live region for every row: "Jira is connected.", "GitHub is disconnected."
  const [announcement, setAnnouncement] = useState('');

  if (status.isError) {
    return (
      <Callout tone="warning" role="alert" title="Could not reach the DevHub server">
        <span>Check that DevHub is still running in your terminal, then reload the page.</span>
      </Callout>
    );
  }

  return (
    <>
      <ul
        aria-label="Connections"
        className="m-0 list-none divide-y divide-border rounded-md border border-border bg-raised p-0"
      >
        <JiraConnectionRow status={status.data?.integrations.jira} announce={setAnnouncement} />
        <GitHubConnectionRow status={status.data?.integrations.github} announce={setAnnouncement} />
        {/* No Connect form until spec 016. */}
        <ConnectionRow
          id="slack"
          name="Slack"
          howToConnect="Reading your mentions needs a Slack app your admin approves."
          status={status.data?.integrations.slack}
        />
      </ul>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
