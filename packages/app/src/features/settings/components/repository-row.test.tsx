import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeRepository } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { RepositoryRow } from './repository-row.tsx';

function row(overrides: Parameters<typeof makeRepository>[0] = {}) {
  const actions = { onEdit: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn() };
  const rendered = render(
    <ul>
      <RepositoryRow folder={makeRepository(overrides)} {...actions} />
    </ul>,
  );
  return { ...rendered, ...actions };
}

describe('RepositoryRow', () => {
  it('AC-6: shows the name, the path with ~ and the Jira project', () => {
    row();

    expect(screen.getByText('intranet-web')).toBeVisible();
    expect(screen.getByText('~/code/intranet-web')).toBeVisible();
    expect(screen.getByText('Jira PROJ')).toBeVisible();
  });

  it('AC-17 (spec 020): More actions names the folder, shows its tooltip, and offers Edit, Duplicate and Delete', async () => {
    const user = userEvent.setup();
    const { container, onEdit, onDuplicate, onDelete } = row();
    const more = screen.getByRole('button', { name: 'More actions for intranet-web' });

    await user.tab();
    expect(more).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('More actions');
    await expectNoAxeViolations(container);

    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu', { name: 'Actions for intranet-web' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Edit', 'Duplicate', 'DeleteThe folder stays on disk.']);
    await user.click(within(menu).getByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledOnce();

    await user.click(more);
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    expect(onDuplicate).toHaveBeenCalledOnce();

    await user.click(more);
    await user.click(await screen.findByRole('menuitem', { name: /^Delete/ }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('closing the menu without picking gives focus back to More actions', async () => {
    const user = userEvent.setup();
    row();
    const more = screen.getByRole('button', { name: 'More actions for intranet-web' });

    await user.click(more);
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');

    expect(more).toHaveFocus();
  });

  it('AC-8: shows no Jira pill for a folder without a project', () => {
    row({ jiraProject: null });

    expect(screen.queryByText(/^Jira/)).not.toBeInTheDocument();
  });
});
