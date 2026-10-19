import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Button } from './button.tsx';
import { NotificationItem } from './notification-item.tsx';

function item(props: Partial<Parameters<typeof NotificationItem>[0]> = {}) {
  return (
    <ul>
      <NotificationItem
        icon={Alert02Icon}
        tone="warning"
        title="Claude wants to run a command"
        detail="PROJ-1423 · Add bulk archive · npm test -- content-list"
        time="2 min ago"
        unread
        onOpen={() => undefined}
        {...props}
      />
    </ul>
  );
}

describe('NotificationItem (spec 029)', () => {
  it('AC-4: names its title and whether it is unread, and is described by its detail and time', async () => {
    const { container } = render(item());

    const open = screen.getByRole('button', { name: 'Claude wants to run a command, unread' });
    expect(open).toHaveAccessibleDescription('PROJ-1423 · Add bulk archive · npm test -- content-list 2 min ago');
    await expectNoAxeViolations(container);
  });

  it('AC-4: a read one is named by its title alone', () => {
    render(item({ unread: false }));

    expect(screen.getByRole('button', { name: 'Claude wants to run a command' })).toBeVisible();
  });

  it('AC-7: opens from its title, or with Enter', async () => {
    const onOpen = vi.fn();
    render(item({ onOpen }));

    await userEvent.click(screen.getByRole('button', { name: /Claude wants to run a command/ }));
    await userEvent.keyboard('{Enter}');

    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('AC-9: its buttons work on their own, without opening it', async () => {
    const onOpen = vi.fn();
    const onAllow = vi.fn();
    render(
      item({
        onOpen,
        actions: (
          <Button size="sm" variant="secondary" onClick={onAllow}>
            Allow once
          </Button>
        ),
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Allow once' }));

    expect(onAllow).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
