import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type CodexLogin } from '@devhub/contracts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

/** Spec 052, Q5: the card's words. */
const lines = {
  signedOut: 'Run codex login in a terminal, then check again.',
  notInstalled: 'Install Codex with npm install -g @openai/codex, then check again.',
  error: "Couldn't check Codex. Check again.",
};

function answerLogin(login: CodexLogin) {
  server.use(http.get(apiUrl(apiRoutes.codexLogin), () => HttpResponse.json(login)));
}

async function openCard() {
  const rendered = await renderApp({ route: '/settings/coding-agent' });
  const card = await screen.findByRole('group', { name: 'Codex' });
  return { ...rendered, card };
}

describe('CodexCard (spec 052)', () => {
  it('AC-1: signed in with ChatGPT, shows Active and the account, with no button', async () => {
    answerLogin({ state: 'signed_in', method: 'chatgpt', email: 'you@company.com' });
    const { card } = await openCard();

    expect(await within(card).findByText('Active')).toBeVisible();
    expect(within(card).getByText('Signed in with ChatGPT as you@company.com')).toBeVisible();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([
    [{ state: 'signed_in', method: 'api_key', email: null }, 'Signed in with an API key'],
    [{ state: 'signed_in', method: 'chatgpt', email: null }, 'Signed in with ChatGPT'],
    [{ state: 'signed_in', method: 'other', email: null }, 'Signed in'],
  ] as const)('AC-1: names the way Codex signs in: %o', async (login, line) => {
    answerLogin(login);
    const { card } = await openCard();

    expect(await within(card).findByText('Active')).toBeVisible();
    expect(within(card).getByText(line, { exact: true })).toBeVisible();
  });

  it.each([
    [{ state: 'signed_out' }, 'Not signed in', lines.signedOut],
    [{ state: 'not_installed' }, 'Not installed', lines.notInstalled],
    [{ state: 'error' }, 'Error', lines.error],
  ] as const)('AC-2: %o shows its state, what to do, and Check again', async (login, pill, line) => {
    answerLogin(login);
    const { card } = await openCard();

    expect(await within(card).findByText(pill)).toBeVisible();
    expect(within(card).getByText((_, element) => element?.textContent === line)).toBeVisible();
    expect(within(card).getByRole('button', { name: 'Check again' })).toBeEnabled();
  });

  it('AC-2: shows Error when the server does not answer at all', async () => {
    server.use(http.get(apiUrl(apiRoutes.codexLogin), () => HttpResponse.error()));
    const { card } = await openCard();

    expect(await within(card).findByText('Error')).toBeVisible();
  });

  it('AC-3: before the first answer, shows its name, busy, with no state yet', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.codexLogin), async () => {
        await delay('infinite');
        return HttpResponse.json({ state: 'signed_out' });
      }),
    );
    const { card } = await openCard();

    expect(card).toHaveAttribute('aria-busy', 'true');
    expect(within(card).queryByText('Not signed in')).not.toBeInTheDocument();
  });

  it('AC-2, AC-26: Check again from the keyboard, then Active, with focus on the account', async () => {
    answerLogin({ state: 'not_installed' });
    server.use(
      http.post(apiUrl(apiRoutes.codexLoginCheck), () =>
        HttpResponse.json({ state: 'signed_in', method: 'chatgpt', email: 'you@company.com' }),
      ),
    );
    const { card, user } = await openCard();
    const button = await within(card).findByRole('button', { name: 'Check again' });
    button.focus();
    await user.keyboard('{Enter}');

    expect(await within(card).findByText('Active')).toBeVisible();
    const account = within(card).getByText('Signed in with ChatGPT as you@company.com');
    await waitFor(() => {
      expect(account).toHaveFocus();
    });
  });

  it('takes the place of "More agents", under the Claude card', async () => {
    await renderApp({ route: '/settings/coding-agent' });
    const cards = await screen.findAllByRole('group', { name: /^(Claude|Codex)$/ });
    expect(
      cards.map((card) => card.getAttribute('aria-labelledby') && within(card).getByRole('heading').textContent),
    ).toEqual(['Claude', 'Codex']);
    expect(screen.queryByText(/More agents are coming later/)).not.toBeInTheDocument();
  });
});
