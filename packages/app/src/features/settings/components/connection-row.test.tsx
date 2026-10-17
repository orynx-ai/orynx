import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { IntegrationStatus } from '@devhub/contracts';
import { Button } from '@devhub/ui';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { ConnectionRow } from './connection-row.tsx';

function renderRow(
  status: IntegrationStatus | undefined,
  extra: { action?: React.ReactNode; children?: React.ReactNode } = {},
) {
  return render(
    <ul aria-label="Connections">
      <ConnectionRow
        id="jira"
        name="Jira"
        howToConnect="Connect with your site address, email and a personal API token."
        status={status}
        {...extra}
      />
    </ul>,
  );
}

describe('ConnectionRow', () => {
  it.each([
    ['connected', 'Connected'],
    ['not_connected', 'Not connected'],
    ['needs_admin_approval', 'Needs admin approval'],
    ['error', 'Error'],
  ] as const)('says %s in words', (state, word) => {
    renderRow({ state, detail: null });
    expect(within(screen.getByRole('listitem')).getByText(word)).toBeVisible();
  });

  it("shows the server's line, or how to connect when there is none", () => {
    const { rerender } = renderRow({ state: 'connected', detail: 'Personal API token for your-team.atlassian.net' });
    expect(screen.getByRole('listitem')).toHaveTextContent('Personal API token for your-team.atlassian.net');

    rerender(
      <ul aria-label="Connections">
        <ConnectionRow id="jira" name="Jira" howToConnect="Connect with your site address." status={undefined} />
      </ul>,
    );
    expect(screen.getByRole('listitem')).toHaveTextContent('Connect with your site address.');
    expect(screen.getByText('Checking')).toHaveAttribute('aria-busy', 'true');
  });

  it('holds its button and what opens under it inside the same row', async () => {
    const { container } = renderRow(
      { state: 'not_connected', detail: null },
      { action: <Button size="sm">Connect</Button>, children: <p>The form</p> },
    );

    const row = screen.getByRole('listitem');
    expect(within(row).getByRole('button', { name: 'Connect' })).toBeVisible();
    expect(within(row).getByText('The form')).toBeVisible();
    await expectNoAxeViolations(container);
  });
});
