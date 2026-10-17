import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeRepository } from '@devhub/contracts/testing';
import { RepositoryRow } from './repository-row.tsx';

describe('RepositoryRow', () => {
  it('AC-6: shows the name, the path with ~ and the Jira project, and Remove names the folder', async () => {
    const onRemove = vi.fn();
    render(
      <ul>
        <RepositoryRow folder={makeRepository()} onRemove={onRemove} />
      </ul>,
    );

    expect(screen.getByText('intranet-web')).toBeVisible();
    expect(screen.getByText('~/code/intranet-web')).toBeVisible();
    expect(screen.getByText('Jira PROJ')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Remove intranet-web' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('AC-8: shows no Jira pill for a folder without a project', () => {
    render(
      <ul>
        <RepositoryRow folder={makeRepository({ jiraProject: null })} onRemove={vi.fn()} />
      </ul>,
    );

    expect(screen.queryByText(/^Jira/)).not.toBeInTheDocument();
  });
});
