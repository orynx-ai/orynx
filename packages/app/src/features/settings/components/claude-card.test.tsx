import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type ClaudeLogin } from '@devhub/contracts';
import { makeClaudeSignedIn, makeStatus } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const designLine = 'Company login through the Claude Agent SDK. No API key needed.';
const notSignedIn =
  "Claude Code isn't signed in on this computer. Run claude in a terminal and sign in with your company login, then check again.";
const checkFailed = "Orynx couldn't run Claude Code's login check. See the terminal for details.";

function answerLogin(login: ClaudeLogin) {
  server.use(http.get(apiUrl(apiRoutes.claudeLogin), () => HttpResponse.json(login)));
}

async function openCard() {
  const rendered = await renderApp({ route: '/settings/coding-agent' });
  const card = await screen.findByRole('group', { name: 'Claude' });
  return { ...rendered, card };
}

describe('ClaudeCard', () => {
  it('AC-2: signed in with claude.ai, shows Active, the design line and the account, with no button', async () => {
    answerLogin(makeClaudeSignedIn());
    const { card } = await openCard();

    expect(await within(card).findByText('Active')).toBeVisible();
    expect(within(card).getByText(designLine)).toBeVisible();
    expect(within(card).getByText('Signed in as you@company.com · Company')).toBeVisible();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
  });

  it('AC-2: leaves the organisation out when Claude Code gives none', async () => {
    answerLogin(makeClaudeSignedIn({ organisation: null }));
    const { card } = await openCard();

    expect(await within(card).findByText('Signed in as you@company.com')).toBeVisible();
  });

  it.each([
    [makeClaudeSignedIn({ method: 'api_key', email: null, organisation: null }), 'Signed in with an API key'],
    [makeClaudeSignedIn({ method: 'bedrock', email: null, organisation: null }), 'Signed in through Amazon Bedrock'],
    [makeClaudeSignedIn({ method: 'vertex', email: null, organisation: null }), 'Signed in through Google Vertex AI'],
    [makeClaudeSignedIn({ method: 'other', email: null, organisation: null }), 'Signed in'],
    [makeClaudeSignedIn({ email: null, organisation: null }), 'Signed in'],
  ])('AC-3: names the way Claude Code signs in: %o', async (login, line) => {
    answerLogin(login);
    const { card } = await openCard();

    expect(await within(card).findByText('Active')).toBeVisible();
    expect(within(card).getByText(line, { exact: true })).toBeVisible();
  });

  it('AC-4: signed out, shows Not signed in, how to sign in, and Check again', async () => {
    const { card } = await openCard();

    expect(await within(card).findByText('Not signed in')).toBeVisible();
    expect(within(card).getByText(designLine)).toBeVisible();
    expect(within(card).getByText((_text, element) => element?.textContent === notSignedIn)).toBeVisible();
    expect(within(card).getByRole('button', { name: 'Check again' })).toBeEnabled();
  });

  it('AC-6: a check that failed shows Error, the error line and Check again', async () => {
    answerLogin({ state: 'error' });
    const { card } = await openCard();

    expect(await within(card).findByText('Error')).toBeVisible();
    expect(within(card).getByText(checkFailed)).toBeVisible();
    expect(within(card).getByRole('button', { name: 'Check again' })).toBeVisible();
  });

  it('AC-6: shows Error when the server does not answer at all', async () => {
    server.use(http.get(apiUrl(apiRoutes.claudeLogin), () => HttpResponse.error()));
    const { card } = await openCard();

    expect(await within(card).findByText('Error')).toBeVisible();
    expect(within(card).getByRole('button', { name: 'Check again' })).toBeVisible();
  });

  it('AC-8: before the first answer, shows the title and the design line, busy, with no state yet', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.claudeLogin), async () => {
        await delay('infinite');
        return HttpResponse.json({ state: 'signed_out' });
      }),
    );
    const { card } = await openCard();

    expect(card).toHaveAttribute('aria-busy', 'true');
    expect(within(card).getByRole('heading', { name: 'Claude' })).toBeVisible();
    expect(within(card).getByText(designLine)).toBeVisible();
    for (const word of ['Active', 'Not signed in', 'Error']) expect(within(card).queryByText(word)).toBeNull();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
  });

  it('AC-7: while Check again runs it says Checking…, keeps focus, and a second press starts no second check', async () => {
    let checks = 0;
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post(apiUrl(apiRoutes.claudeLoginCheck), async () => {
        checks += 1;
        await released;
        return HttpResponse.json({ state: 'signed_out' });
      }),
    );
    const { card, user } = await openCard();
    const button = await within(card).findByRole('button', { name: 'Check again' });

    await user.click(button);
    expect(button).toHaveAccessibleName('Checking…');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveFocus();
    await user.click(button);
    await user.keyboard('{Enter}');
    release();

    await waitFor(() => {
      expect(button).toHaveAccessibleName('Check again');
    });
    expect(button).toHaveFocus();
    expect(checks).toBe(1);
  });

  it('AC-6: Check again that never reaches the server shows Error, and focus stays on the button', async () => {
    server.use(http.post(apiUrl(apiRoutes.claudeLoginCheck), () => HttpResponse.error()));
    const { card, user } = await openCard();
    const button = await within(card).findByRole('button', { name: 'Check again' });

    await user.click(button);

    expect(await within(card).findByText('Error')).toBeVisible();
    expect(within(card).getByText(checkFailed)).toBeVisible();
    expect(button).toHaveFocus();
  });

  it("AC-6: a newer answer from the server replaces a failed Check again's Error", async () => {
    let signedIn = false;
    server.use(
      http.post(apiUrl(apiRoutes.claudeLoginCheck), () => HttpResponse.error()),
      http.get(apiUrl(apiRoutes.claudeLogin), () =>
        HttpResponse.json(signedIn ? makeClaudeSignedIn() : { state: 'signed_out' }),
      ),
    );
    const { card, user } = await openCard();
    await user.click(await within(card).findByRole('button', { name: 'Check again' }));
    await within(card).findByText('Error');

    signedIn = true;
    FakeEventSource.latest().emit({ type: 'status.changed' });

    expect(await within(card).findByText('Active')).toBeVisible();
  });

  it('AC-5: Check again that finds a login shows Active, and focus lands on the account', async () => {
    let connected = false;
    server.use(
      http.post(apiUrl(apiRoutes.claudeLoginCheck), () => {
        connected = true;
        return HttpResponse.json(makeClaudeSignedIn());
      }),
      http.get(apiUrl(apiRoutes.status), () => HttpResponse.json(makeStatus({ agent: { id: 'claude', connected } }))),
    );
    const { card, user } = await openCard();

    await user.click(await within(card).findByRole('button', { name: 'Check again' }));

    expect(await within(card).findByText('Active')).toBeVisible();
    expect(within(card).getByText('Signed in as you@company.com · Company')).toHaveFocus();
  });
});
