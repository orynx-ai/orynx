import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { ExternalLink } from './external-link.tsx';

describe('ExternalLink', () => {
  it('opens outside Orynx through the host, never in the page, and is named by its text alone', async () => {
    const onOpen = vi.fn();
    const { container } = render(
      <ExternalLink href="https://your-team.atlassian.net/browse/PROJ-1423" onOpen={onOpen}>
        Open in Jira
      </ExternalLink>,
    );
    const link = screen.getByRole('link', { name: 'Open in Jira' });
    expect(link).toHaveAttribute('href', 'https://your-team.atlassian.net/browse/PROJ-1423');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    await userEvent.setup().click(link);
    expect(onOpen).toHaveBeenCalledWith('https://your-team.atlassian.net/browse/PROJ-1423');
    await expectNoAxeViolations(container);
  });

  it('can be reached and opened with the keyboard', async () => {
    const onOpen = vi.fn();
    render(
      <ExternalLink href="https://id.atlassian.com/manage-profile/security/api-tokens" onOpen={onOpen}>
        Create an API token
      </ExternalLink>,
    );
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Create an API token' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('in a sentence, has no axe violations beside text of its own colour, since it stays underlined', async () => {
    const { container } = render(
      <p>
        See{' '}
        <ExternalLink look="inline" size="inherit" href="https://figma.example.com/f" onOpen={() => undefined}>
          the design
        </ExternalLink>{' '}
        before you start.
      </p>,
    );
    expect(screen.getByRole('link', { name: 'the design' })).toBeVisible();
    await expectNoAxeViolations(container);
  });
});
