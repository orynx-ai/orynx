import { useId, useRef, useState } from 'react';
import type { IntegrationStatus } from '@devhub/contracts';
import { Button } from '@devhub/ui';
import { useJiraChangeRunning, useJiraConnection } from '../queries.ts';
import { ConnectionRow } from './connection-row.tsx';
import { JiraConnectionForm } from './jira-connection-form.tsx';

/** The Jira row: Connect or Manage opens the form inside the row (spec 003, Q3). */
export function JiraConnectionRow({ status }: { status: IntegrationStatus | undefined }) {
  const connection = useJiraConnection();
  const changing = useJiraChangeRunning();
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
          // Closing the form can't stop a Connect or Disconnect on its way. aria-disabled, not
          // disabled, so focus can land here the moment the change finishes.
          aria-disabled={changing || undefined}
          aria-controls={open && connection.data ? formId : undefined}
          onClick={() => {
            if (changing) return;
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
      {open && connection.isLoadingError ? (
        <p role="alert" className="m-0 text-small text-danger sm:ps-14">
          Could not reach the DevHub server. Check that DevHub is still running in your terminal, then reload the page.
        </p>
      ) : null}
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
