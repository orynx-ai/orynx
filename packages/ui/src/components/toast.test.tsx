import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Alert02Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Button } from './button.tsx';
import { Toast, ToastRegion } from './toast.tsx';

describe('Toast (spec 029)', () => {
  it('AC-23: an approval is an alert, named by its title and described by its detail, with its buttons', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <ToastRegion>
        <Toast
          icon={Alert02Icon}
          tone="warning"
          role="alert"
          title="Claude wants to run a command"
          detail="PROJ-1423 · Add bulk archive · npm test -- content-list"
          onOpen={() => undefined}
          onClose={onClose}
          actions={<Button size="sm">Allow once</Button>}
        />
      </ToastRegion>,
    );

    const toast = within(screen.getByRole('region', { name: 'Pop-ups' })).getByRole('alert', {
      name: 'Claude wants to run a command',
    });
    expect(toast).toHaveAccessibleDescription('PROJ-1423 · Add bulk archive · npm test -- content-list');
    expect(within(toast).getByRole('button', { name: 'Allow once' })).toBeVisible();
    await userEvent.click(within(toast).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });

  it('AC-24: anything else is a polite status that opens from its title', async () => {
    const onOpen = vi.fn();
    render(
      <Toast
        icon={CheckmarkCircle02Icon}
        tone="success"
        role="status"
        title="Session finished, ready for a pull request"
        detail="PROJ-1398 · Read receipts on analytics"
        onOpen={onOpen}
        onClose={() => undefined}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Session finished, ready for a pull request' }));

    expect(screen.getByRole('status', { name: 'Session finished, ready for a pull request' })).toBeVisible();
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
