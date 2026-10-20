import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type AgentsAccess } from '@devhub/contracts';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const config = JSON.stringify({
  mcpServers: { orynx: { command: '/usr/local/bin/node', args: ['/x/orynx-mcp.mjs'] } },
});

/** The agents' door on the server: what it holds, what each change sent, and the config it writes. */
function serveDoor({ enabled = false, fails = false } = {}) {
  let held = enabled;
  const sent: AgentsAccess[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.agentsAccess), () => HttpResponse.json({ enabled: held })),
    http.put(apiUrl(apiRoutes.agentsAccess), async ({ request }) => {
      const body = (await request.json()) as AgentsAccess;
      sent.push(body);
      if (fails) return HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 });
      held = body.enabled;
      return HttpResponse.json(body);
    }),
    http.post(apiUrl(apiRoutes.agentsAccessConfig), () => HttpResponse.json({ config })),
  );
  return sent;
}

const toggle = () => screen.getByRole('switch', { name: 'Other agents' });

describe('Other agents (spec 037)', () => {
  it('AC-39: is off by default, says what it does, and offers no config', async () => {
    serveDoor();
    const { container } = await renderApp({ route: '/settings/coding-agent' });

    expect(await screen.findByRole('switch', { name: 'Other agents' })).not.toBeChecked();
    expect(
      screen.getByText(
        'Let Claude Code, Cursor, Codex or any MCP client use Orynx tickets on this computer. They can read, create and edit tickets, but not delete them.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Copy MCP config' })).toBeNull();
    await expectNoAxeViolations(container);
  });

  it('AC-40: turned on, Copy MCP config copies the config to paste into another agent', async () => {
    const sent = serveDoor();
    const { user } = await renderApp({ route: '/settings/coding-agent' });
    await screen.findByRole('switch', { name: 'Other agents' });

    await user.click(toggle());
    const copy = await screen.findByRole('button', { name: 'Copy MCP config' });
    expect(sent).toEqual([{ enabled: true }]);
    // Copy waits for the config the server writes.
    await waitFor(() => {
      expect(copy).toBeEnabled();
    });
    await user.click(copy);

    expect(await navigator.clipboard.readText()).toBe(config);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeVisible();
  });

  it('AC-42: turned off, the config is gone from the row', async () => {
    const sent = serveDoor({ enabled: true });
    const { user } = await renderApp({ route: '/settings/coding-agent' });
    await screen.findByRole('button', { name: 'Copy MCP config' });

    await user.click(toggle());

    expect(sent).toEqual([{ enabled: false }]);
    await screen.findByRole('switch', { name: 'Other agents', checked: false });
    expect(screen.queryByRole('button', { name: 'Copy MCP config' })).toBeNull();
  });

  it('a change that fails says so in spec 005’s words', async () => {
    serveDoor({ fails: true });
    const { user } = await renderApp({ route: '/settings/coding-agent' });
    await screen.findByRole('switch', { name: 'Other agents' });

    await user.click(toggle());

    expect(
      await screen.findByText("Couldn't save that change. Check that Orynx is still running, then try again."),
    ).toBeVisible();
    expect(toggle()).not.toBeChecked();
  });
});
