import { useId, useRef, useState } from 'react';
import type { IntegrationStatus } from '@devhub/contracts';
import { Button } from '@devhub/ui';
import { useJiraConnection } from '../queries.ts';
import { ConnectionRow } from './connection-row.tsx';
import { JiraConnectionForm } from './jira-connection-form.tsx';

/** The Jira row: Connect or Manage opens the form inside the row (spec 003, Q3). */
export function JiraConnectionRow({ status }: { status: IntegrationStatus | undefined }) {
  const connection = useJiraConnection();
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const toggle = useRef<HTMLButtonElement>(null);
  const formId = useId();

  // Until the saved settings arrive, the status says whether anything is set up.
  const configured = connection.data
    ? connection.data.saved !== null
    : (status?.state ?? 'not_connected') !== 'not_connected';

  function close(message?: string) {
    setOpen(false);
    if (message !== undefined) setAnnouncement(message);
    toggle.current?.focus();
  }

  return (
    <ConnectionRow
      id="jira"
      name="Jira"
      howToConnect="Connect with your site address, email and a personal API token."
      status={status}
      action={
        <Button
          ref={toggle}
          size="sm"
          aria-expanded={open}
          aria-controls={open ? formId : undefined}
          onClick={() => {
            if (open) close();
            else {
              setAnnouncement('');
              setOpen(true);
            }
          }}
        >
          {open ? 'Close' : configured ? 'Manage' : 'Connect'}
        </Button>
      }
    >
      {open && connection.data ? (
        <div className="sm:ps-14">
          <JiraConnectionForm
            id={formId}
            connection={connection.data}
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
        </div>
      ) : null}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </ConnectionRow>
  );
}
