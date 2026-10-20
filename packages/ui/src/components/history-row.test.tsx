import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { HistoryList, HistoryRow } from './history-row.tsx';

function History() {
  return (
    <HistoryList aria-label="Sync history">
      <HistoryRow
        tone="danger"
        time="09:57"
        lead="Jira"
        summary="Failed · token refused"
        summaryTone="danger"
        duration="0.3s"
        status="failed"
      >
        <p>Jira refused Orynx’s saved token.</p>
      </HistoryRow>
      <HistoryRow tone="success" time="09:40" summary="2 new" duration="1.4s" status="succeeded" defaultOpen>
        <p>PROJ-1431 assigned to you</p>
      </HistoryRow>
    </HistoryList>
  );
}

describe('HistoryRow (spec 035)', () => {
  it('AC-12: each row is a button named by its time, summary and duration, described by its result, in a named list', async () => {
    const { container } = render(<History />);

    expect(screen.getByRole('list', { name: 'Sync history' })).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    const row = screen.getByRole('button', { name: '09:57 Jira Failed · token refused 0.3s' });
    expect(row).toHaveAccessibleDescription('failed');
    expect(row).toHaveAttribute('aria-expanded', 'false');
    await expectNoAxeViolations(container);
  });

  it('AC-13: a click or Enter opens the row below itself, and pressing it again closes it', async () => {
    const user = userEvent.setup();
    render(<History />);
    const row = screen.getByRole('button', { name: /09:57/ });
    expect(screen.queryByText('Jira refused Orynx’s saved token.')).toBeNull();

    await user.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Jira refused Orynx’s saved token.')).toBeVisible();
    expect(document.getElementById(row.getAttribute('aria-controls') ?? '')).toContainElement(
      screen.getByText('Jira refused Orynx’s saved token.'),
    );

    row.focus();
    await user.keyboard('{Enter}');
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Jira refused Orynx’s saved token.')).toBeNull();
  });

  it('AC-25: a row opened at the start shows its content', () => {
    render(<History />);

    expect(screen.getByRole('button', { name: /09:40/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('PROJ-1431 assigned to you')).toBeVisible();
  });
});
