import { useState } from 'react';
import type { IntegrationId } from '@devhub/contracts';
import { useStatus } from '../queries.ts';
import { ConnectionRow } from './connection-row.tsx';
import { GitHubConnectionRow } from './github-connection-row.tsx';
import { JiraConnectionRow } from './jira-connection-row.tsx';
import type { RowControls } from './managed-connection-row.tsx';
import { ServerUnreachable } from './server-unreachable.tsx';

/** Settings › Connections: one row per tool with its state in a word, never colour alone. */
export function ConnectionsPanel() {
  const status = useStatus();
  // One polite live region for every row: "Jira is connected.", "GitHub is disconnected."
  const [announcement, setAnnouncement] = useState('');
  // One form open at a time, so the page has one primary button (design system).
  const [openRow, setOpenRow] = useState<IntegrationId | null>(null);

  function controlsFor(id: IntegrationId): RowControls {
    return {
      open: openRow === id,
      onOpenChange: (open) => {
        setOpenRow((current) => (open ? id : current === id ? null : current));
      },
      announce: setAnnouncement,
    };
  }

  if (status.isError) return <ServerUnreachable />;

  return (
    <>
      <ul
        aria-label="Connections"
        className="m-0 list-none divide-y divide-border rounded-md border border-border bg-raised p-0"
      >
        <JiraConnectionRow status={status.data?.integrations.jira} {...controlsFor('jira')} />
        <GitHubConnectionRow status={status.data?.integrations.github} {...controlsFor('github')} />
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
