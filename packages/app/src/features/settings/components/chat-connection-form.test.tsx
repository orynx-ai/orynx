import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeDiscordConnection, makeSlackConnection } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

async function openDialog(tool: 'Slack' | 'Discord') {
  const rendered = await renderApp({ route: '/settings/connections' });
  await rendered.user.click(await screen.findByRole('button', { name: `${tool}: Not connected. Manage connection` }));
  return { ...rendered, dialog: await screen.findByRole('dialog', { name: tool }) };
}

describe('ChatConnectionForm (spec 016)', () => {
  it('AC-2: an empty token is refused before anything is sent, in the token’s own words', async () => {
    let sent = false;
    server.use(
      http.put(apiUrl(apiRoutes.slackConnection), () => {
        sent = true;
        return HttpResponse.json(makeSlackConnection());
      }),
    );
    const { user, dialog } = await openDialog('Slack');

    await user.click(within(dialog).getByRole('button', { name: 'Connect' }));

    expect(await within(dialog).findByText('Paste your Slack token.')).toBeVisible();
    expect(sent).toBe(false);
  });

  it('a token in .env may stay empty, and the field says so', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.discordConnection), () =>
        HttpResponse.json(makeDiscordConnection({ saved: null, envToken: true })),
      ),
    );
    const { dialog } = await openDialog('Discord');

    expect(within(dialog).getByText('Leave empty to use DEVHUB_DISCORD_BOT_TOKEN from .env.')).toBeVisible();
  });

  it('a server problem that isn’t about the token is said under it all', async () => {
    server.use(
      http.put(apiUrl(apiRoutes.slackConnection), () =>
        HttpResponse.json(
          {
            code: 'integration_unreachable',
            message: "Can't reach slack.com. Check your network or VPN, then try again.",
          },
          { status: 502 },
        ),
      ),
    );
    const { user, dialog } = await openDialog('Slack');

    await user.type(within(dialog).getByLabelText('Paste your Slack token'), 'fake-slack-token');
    await user.click(within(dialog).getByRole('button', { name: 'Connect' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Can't reach slack.com.");
  });
});
