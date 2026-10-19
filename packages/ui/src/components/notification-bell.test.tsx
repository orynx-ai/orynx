import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { NotificationBell } from './notification-bell.tsx';

describe('NotificationBell (spec 029)', () => {
  it('AC-1: says how many are unread in its name and its count, and "Notifications" in its tooltip', async () => {
    const { container } = render(<NotificationBell unread={4} />);
    const bell = screen.getByRole('button', { name: 'Notifications, 4 unread' });

    expect(bell).toHaveTextContent('4');
    await userEvent.hover(bell);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Notifications');
    await expectNoAxeViolations(container);
  });

  it('AC-1: shows no count with none unread, and 99+ above 99', () => {
    const { rerender } = render(<NotificationBell unread={0} />);
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveTextContent('');

    rerender(<NotificationBell unread={140} />);
    expect(screen.getByRole('button', { name: 'Notifications, 140 unread' })).toHaveTextContent('99+');
  });

  it('AC-4: is pressed like any button', async () => {
    const onClick = vi.fn();
    render(<NotificationBell unread={2} onClick={onClick} />);

    await userEvent.tab();
    await userEvent.keyboard('{Enter}');

    expect(onClick).toHaveBeenCalledOnce();
  });
});
