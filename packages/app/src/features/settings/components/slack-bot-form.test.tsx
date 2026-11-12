import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeSlackConnection, makeStatus } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

/** Settings › Connections with Slack connected, its bot saved or not, and Slack's dialog open. */
async function openSlack({ bot }: { bot: boolean }) {
  server.use(
    http.get(apiUrl(apiRoutes.status), () =>
      HttpResponse.json(makeStatus({ integrations: { slack: { state: 'connected', detail: 'Neha K. in Acme' } } })),
    ),
    http.get(apiUrl(apiRoutes.slackConnection), () => HttpResponse.json(makeSlackConnection({ bot }))),
  );
  const app = await renderApp({ route: '/settings/connections' });
  await app.user.click(await screen.findByRole('button', { name: 'Slack: Connected. Manage connection' }));
  return { ...app, dialog: await screen.findByRole('dialog', { name: 'Slack' }) };
}

describe("Slack's bot token (spec 057, AC-14)", () => {
  it('a pasted bot token is checked and saved, and the dialog then says so', async () => {
    const sent: unknown[] = [];
    server.use(
      http.put(apiUrl(apiRoutes.slackBot), async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json(makeSlackConnection({ bot: true }));
      }),
    );
    const { user, dialog } = await openSlack({ bot: false });

    const field = await within(dialog).findByLabelText('Bot token (optional)');
    expect(within(dialog).getByText('Lets Orynx message you. Starts with xoxb-.')).toBeVisible();
    await user.type(field, 'fake-slack-bot-token{Enter}');

    await waitFor(() => {
      expect(sent).toEqual([{ token: 'fake-slack-bot-token' }]);
    });
    expect(await within(dialog).findByText('Bot token saved')).toBeVisible();
    expect(within(dialog).queryByLabelText('Bot token (optional)')).toBeNull();
  });

  it('a token Slack refused says so under the field, and nothing is kept', async () => {
    server.use(
      http.put(apiUrl(apiRoutes.slackBot), () =>
        HttpResponse.json(
          { code: 'integration_rejected', message: "That token didn't work with Slack." },
          { status: 422 },
        ),
      ),
    );
    const { user, dialog } = await openSlack({ bot: false });

    const field = await within(dialog).findByLabelText('Bot token (optional)');
    await user.type(field, 'fake-wrong-token');
    await user.click(within(dialog).getByRole('button', { name: 'Save bot token' }));

    expect(await within(dialog).findByText("That token didn't work with Slack.")).toBeVisible();
    expect(field).toHaveFocus();
    expect(within(dialog).queryByText('Bot token saved')).toBeNull();
  });

  it('Remove takes the bot away, and the field comes back', async () => {
    let removed = false;
    server.use(
      http.delete(apiUrl(apiRoutes.slackBot), () => {
        removed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user, dialog } = await openSlack({ bot: true });

    expect(await within(dialog).findByText('Bot token saved')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Remove bot token' }));

    await waitFor(() => {
      expect(removed).toBe(true);
    });
    expect(await within(dialog).findByLabelText('Bot token (optional)')).toBeVisible();
  });
});
