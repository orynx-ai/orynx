import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeIcon } from '@hugeicons/core-free-icons';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { AgentLoginCard } from './agent-login-card.tsx';

const card = (props: Partial<Parameters<typeof AgentLoginCard>[0]> = {}) => (
  <AgentLoginCard
    name="Codex"
    icon={CodeIcon}
    pill={{ tone: 'success', label: 'Active' }}
    account="Signed in with ChatGPT as you@company.com"
    notReady={null}
    checking={false}
    onCheck={() => undefined}
    {...props}
  />
);

describe('AgentLoginCard (spec 052)', () => {
  it('AC-1: a ready agent shows its name, its state and how it is signed in, with nothing to press', async () => {
    const { container } = render(card({ line: 'Uses your own login.' }));
    const group = screen.getByRole('group', { name: 'Codex' });

    expect(within(group).getByText('Active')).toBeVisible();
    expect(within(group).getByText('Uses your own login.')).toBeVisible();
    expect(within(group).getByText('Signed in with ChatGPT as you@company.com')).toBeVisible();
    expect(within(group).queryByRole('button')).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('AC-2: an agent that is not ready says what to do, and Check again asks once', async () => {
    const onCheck = vi.fn();
    const { container } = render(
      card({ pill: { tone: 'warning', label: 'Not signed in' }, account: null, notReady: 'Sign in.', onCheck }),
    );

    expect(screen.getByText('Sign in.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onCheck).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });

  it('AC-3: before the first answer it is busy, and while a check runs it says Checking…', () => {
    const { rerender } = render(card({ pill: null, account: null }));
    expect(screen.getByRole('group', { name: 'Codex' })).toHaveAttribute('aria-busy', 'true');

    rerender(card({ pill: { tone: 'danger', label: 'Error' }, account: null, notReady: 'Try again.', checking: true }));
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeVisible();
  });
});
