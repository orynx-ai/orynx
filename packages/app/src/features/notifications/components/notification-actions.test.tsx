import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type Notification } from '@devhub/contracts';
import { makeNotification, makeNotificationList } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const session = {
  id: '00000000000000aa',
  title: 'Add bulk archive',
  source: { kind: 'jira' as const, key: 'PROJ-1423' },
};

function asking(about: 'command' | 'edit' | 'push' | 'pull_request', waiting = true): Notification {
  return makeNotification({
    id: `approval-${about}`,
    at: new Date().toISOString(),
    what: {
      kind: 'approval',
      session,
      approvalId: 'call-1',
      about,
      command: about === 'edit' ? null : 'npm test -- content-list',
      waiting,
    },
  });
}

function listing(notifications: Notification[]) {
  server.use(http.get(apiUrl(apiRoutes.notifications), () => HttpResponse.json(makeNotificationList(notifications))));
}

function answering() {
  const asked: { url: string; body: unknown }[] = [];
  server.use(
    http.post(apiUrl(apiRoutes.sessionApproval), async ({ request }) => {
      asked.push({ url: new URL(request.url).pathname, body: await request.json() });
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(apiUrl(apiRoutes.notificationsRead), async ({ request }) => {
      asked.push({ url: new URL(request.url).pathname, body: await request.json() });
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return asked;
}

async function openPanel(user: Awaited<ReturnType<typeof renderApp>>['user']) {
  const nav = screen.getByRole('navigation', { name: 'Main' });
  await user.click(await within(nav).findByRole('button', { name: /^Notifications/ }));
  return screen.getByRole('dialog', { name: 'Notifications' });
}

describe('answering from the panel (spec 029)', () => {
  it('AC-9, AC-12: Allow once runs that one command, reads the notification, and its buttons go once it is answered', async () => {
    listing([asking('command')]);
    const asked = answering();
    const { user } = await renderApp();
    const panel = await openPanel(user);

    await user.click(within(panel).getByRole('button', { name: 'Allow once' }));

    await waitFor(() => {
      expect(asked).toEqual([
        { url: '/api/sessions/00000000000000aa/approvals/call-1', body: { decision: 'allow_once' } },
        { url: '/api/notifications/read', body: { ids: ['approval-command'] } },
      ]);
    });
    listing([{ ...asking('command', false), read: true }]);
    FakeEventSource.latest().emit({ type: 'notifications.changed' });
    await waitFor(() => {
      expect(within(panel).queryByRole('button', { name: 'Allow once' })).toBeNull();
    });
    expect(within(panel).queryByRole('button', { name: 'Review' })).toBeNull();
    expect(within(panel).getByRole('tab', { name: 'Needs you' })).toBeVisible();
  });

  it('AC-10: Review opens the session, whose callout answers it, and reads the notification', async () => {
    listing([asking('command')]);
    const asked = answering();
    const { user, history } = await renderApp();
    const panel = await openPanel(user);

    await user.click(within(panel).getByRole('button', { name: 'Review' }));

    expect(history.location.pathname).toBe('/sessions/00000000000000aa');
    expect(asked).toEqual([{ url: '/api/notifications/read', body: { ids: ['approval-command'] } }]);
  });

  it.each(['edit', 'push', 'pull_request'] as const)('AC-11: a waiting %s shows Review only', async (about) => {
    listing([asking(about)]);
    const { user } = await renderApp();
    const panel = await openPanel(user);

    expect(within(panel).getByRole('button', { name: 'Review' })).toBeVisible();
    expect(within(panel).queryByRole('button', { name: 'Allow once' })).toBeNull();
  });
});
