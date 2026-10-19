import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Button } from './button.tsx';
import { NotificationItem } from './notification-item.tsx';
import {
  NotificationGroup,
  NotificationPanel,
  NotificationPanelContent,
  NotificationPanelNote,
  NotificationPanelSkeleton,
  NotificationPanelTrigger,
  NotificationTabs,
  NotificationTabsContent,
  NotificationTabsList,
} from './notification-panel.tsx';
import { TabsTrigger } from './tabs.tsx';

function Panel({ waiting = <NotificationPanelNote>Nothing is waiting for you.</NotificationPanelNote> }) {
  return (
    <NotificationPanel>
      <NotificationPanelTrigger unread={1} />
      <NotificationPanelContent
        actions={
          <Button size="sm" variant="ghost">
            Mark all read
          </Button>
        }
        foot={<a href="/settings/notifications">All settings</a>}
      >
        <NotificationTabs defaultValue="all">
          <NotificationTabsList>
            <TabsTrigger value="all" count={1}>
              All
            </TabsTrigger>
            <TabsTrigger value="needs-you">Needs you</TabsTrigger>
          </NotificationTabsList>
          <NotificationTabsContent value="all">
            <NotificationGroup heading="Today">
              <NotificationItem
                icon={CheckmarkCircle02Icon}
                tone="success"
                title="Session finished, ready for a pull request"
                detail="PROJ-1398 · Read receipts on analytics"
                time="40 min ago"
                unread
                onOpen={() => undefined}
              />
            </NotificationGroup>
          </NotificationTabsContent>
          <NotificationTabsContent value="needs-you">{waiting}</NotificationTabsContent>
        </NotificationTabs>
      </NotificationPanelContent>
    </NotificationPanel>
  );
}

describe('NotificationPanel (spec 029)', () => {
  it('AC-4: the bell opens a dialog named Notifications, with its head, tabs, groups and foot', async () => {
    render(<Panel />);

    await userEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));

    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(within(panel).getByRole('button', { name: 'Mark all read' })).toHaveFocus();
    expect(within(panel).getByRole('tab', { name: 'All 1', selected: true })).toBeVisible();
    expect(within(panel).getByRole('region', { name: 'Today' })).toBeVisible();
    expect(
      within(panel).getByRole('button', { name: 'Session finished, ready for a pull request, unread' }),
    ).toBeVisible();
    expect(within(panel).getByRole('link', { name: 'All settings' })).toBeVisible();
    await expectNoAxeViolations(panel);
  });

  it('AC-5: Esc and Close close it, and focus goes back to the bell', async () => {
    render(<Panel />);
    const bell = screen.getByRole('button', { name: 'Notifications, 1 unread' });

    await userEvent.click(bell);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(bell).toHaveFocus();

    await userEvent.click(bell);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(bell).toHaveFocus();
  });

  it('AC-6, AC-14: the arrow keys move between the tabs', async () => {
    render(<Panel />);
    await userEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));

    screen.getByRole('tab', { name: 'All 1' }).focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Needs you', selected: true })).toHaveFocus();
    expect(screen.getByText('Nothing is waiting for you.')).toBeVisible();
  });

  it('AC-16: three skeleton rows, marked busy, while the list is on its way', async () => {
    render(<Panel waiting={<NotificationPanelSkeleton />} />);
    await userEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Needs you' }));

    const loading = screen.getByRole('list', { name: 'Notifications loading' });
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(within(loading).getAllByRole('listitem')).toHaveLength(3);
  });

  it('AC-16: an error is an alert, with its button', async () => {
    render(
      <Panel
        waiting={
          <NotificationPanelNote role="alert" action={<Button size="sm">Try again</Button>}>
            Notifications didn’t load.
          </NotificationPanelNote>
        }
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Needs you' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Notifications didn’t load.Try again');
  });
});
