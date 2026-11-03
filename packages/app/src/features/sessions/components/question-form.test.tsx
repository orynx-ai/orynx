import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type SessionQuestion } from '@devhub/contracts';
import { makeQuestionApproval, makeSession } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const id = '0123456789abcdef';
const route = `/sessions/${id}`;

const library: SessionQuestion = {
  question: 'Which date library should we use?',
  header: 'Library',
  multiSelect: false,
  options: [
    { label: 'date-fns', description: 'Already a dependency' },
    { label: 'Day.js', description: 'Smaller, a new dependency' },
    { label: 'Temporal', description: 'Built in, needs a polyfill' },
  ],
};
const checks: SessionQuestion = {
  question: 'Which checks should run?',
  header: 'Checks',
  multiSelect: true,
  options: [
    { label: 'Unit tests', description: 'Vitest' },
    { label: 'Types', description: 'tsc' },
  ],
};
const naming: SessionQuestion = {
  question: 'What should the button say?',
  header: 'Wording',
  multiSelect: false,
  options: [
    { label: 'Archive', description: '' },
    { label: 'Archive selected', description: '' },
  ],
};

/** Claude asks these questions; each answer's body is recorded, and the server answers it as `reply` says. */
function setUp(
  questions: SessionQuestion[] = [library],
  reply: () => Response | Promise<Response> = () => new Response(null, { status: 204 }),
) {
  const session = makeSession({ id, state: 'needs_you', approvals: [makeQuestionApproval({ questions })] });
  const sent: unknown[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.session), () => HttpResponse.json(session)),
    http.post(apiUrl(apiRoutes.sessionApproval), async ({ request }) => {
      sent.push(await request.json());
      return reply();
    }),
  );
  return { sent };
}

describe("Claude's question in the callout (spec 051)", () => {
  it('AC-1: says Claude has a question, with each choice as a card, Other, Send answer and Skip, and leaves focus where it was', async () => {
    setUp();
    await renderApp({ route });

    const callout = await screen.findByRole('alert');
    expect(within(callout).getByText('Claude has a question')).toBeVisible();
    expect(within(callout).getByText('Library')).toBeVisible();
    const group = within(callout).getByRole('radiogroup', { name: 'Which date library should we use?' });
    expect(within(group).getAllByRole('radio')).toEqual([
      within(group).getByRole('radio', { name: 'date-fns' }),
      within(group).getByRole('radio', { name: 'Day.js' }),
      within(group).getByRole('radio', { name: 'Temporal' }),
      within(group).getByRole('radio', { name: 'Other' }),
    ]);
    expect(within(group).getByRole('radio', { name: 'date-fns' })).toHaveAccessibleDescription('Already a dependency');
    expect(within(callout).getAllByRole('button')).toEqual([
      within(callout).getByRole('button', { name: 'Send answer' }),
      within(callout).getByRole('button', { name: 'Skip' }),
    ]);
    expect(within(callout).queryByRole('textbox')).toBeNull();
    expect(callout).not.toContainElement(document.activeElement as HTMLElement | null);
  });

  it('AC-2: the choice you pick goes to Claude when you press Send answer', async () => {
    const { sent } = setUp();
    const { user } = await renderApp({ route });

    await user.click(await screen.findByRole('radio', { name: 'Day.js' }));
    await user.click(screen.getByRole('button', { name: 'Send answer' }));

    await waitFor(() => {
      expect(sent).toEqual([{ decision: 'answer', answers: [{ picked: ['Day.js'], other: null }] }]);
    });
  });

  it('AC-3: Other opens a box for your own answer, and Enter sends it', async () => {
    const { sent } = setUp();
    const { user } = await renderApp({ route });

    await user.click(await screen.findByRole('radio', { name: 'Other' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Your answer' }),
      "Use date-fns, it's already a dependency{Enter}",
    );

    await waitFor(() => {
      expect(sent).toEqual([
        { decision: 'answer', answers: [{ picked: [], other: "Use date-fns, it's already a dependency" }] },
      ]);
    });
  });

  it('AC-4: a question that takes several has checkboxes, Other among them', async () => {
    const { sent } = setUp([checks]);
    const { user } = await renderApp({ route });

    const group = await screen.findByRole('group', { name: 'Which checks should run?' });
    expect(within(group).getAllByRole('checkbox')).toHaveLength(3);
    await user.click(within(group).getByRole('checkbox', { name: 'Unit tests' }));
    await user.click(within(group).getByRole('checkbox', { name: 'Types' }));
    await user.click(within(group).getByRole('checkbox', { name: 'Other' }));
    await user.type(within(group).getByRole('textbox', { name: 'Your answer' }), 'And a smoke test');
    await user.click(screen.getByRole('button', { name: 'Send answer' }));

    await waitFor(() => {
      expect(sent).toEqual([
        { decision: 'answer', answers: [{ picked: ['Unit tests', 'Types'], other: 'And a smoke test' }] },
      ]);
    });
  });

  it('AC-5: three questions in one callout, in the order Claude asked, sent together', async () => {
    const { sent } = setUp([library, checks, naming]);
    const { user } = await renderApp({ route });

    const callout = await screen.findByRole('alert');
    expect(within(callout).getByText('Claude has 3 questions')).toBeVisible();
    const first = within(callout).getByRole('radiogroup', { name: 'Which date library should we use?' });
    const second = within(callout).getByRole('group', { name: 'Which checks should run?' });
    const third = within(callout).getByRole('radiogroup', { name: 'What should the button say?' });
    expect(first.compareDocumentPosition(second)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(second.compareDocumentPosition(third)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await user.click(screen.getByRole('radio', { name: 'date-fns' }));
    await user.click(screen.getByRole('checkbox', { name: 'Types' }));
    await user.click(screen.getByRole('radio', { name: 'Archive selected' }));
    await user.click(screen.getByRole('button', { name: 'Send answer' }));

    await waitFor(() => {
      expect(sent).toEqual([
        {
          decision: 'answer',
          answers: [
            { picked: ['date-fns'], other: null },
            { picked: ['Types'], other: null },
            { picked: ['Archive selected'], other: null },
          ],
        },
      ]);
    });
  });

  it('AC-6: sends nothing until each question has an answer, says what to do, and moves focus to the first one missing', async () => {
    const { sent } = setUp([library, checks]);
    const { user } = await renderApp({ route });

    await user.click(await screen.findByRole('checkbox', { name: 'Types' }));
    await user.click(screen.getByRole('button', { name: 'Send answer' }));

    const first = screen.getByRole('radiogroup', { name: 'Which date library should we use?' });
    expect(await within(first).findByText('Pick an answer.')).toBeVisible();
    expect(first).toHaveAccessibleDescription('Pick an answer.');
    expect(screen.getByRole('radio', { name: 'date-fns' })).toHaveFocus();

    await user.click(screen.getByRole('radio', { name: 'Other' }));
    await user.click(screen.getByRole('button', { name: 'Send answer' }));
    const box = screen.getByRole('textbox', { name: 'Your answer' });
    expect(box).toHaveAccessibleDescription('Type your answer.');
    expect(box).toHaveFocus();

    await user.click(box);
    await user.paste('x'.repeat(2001));
    await user.click(screen.getByRole('button', { name: 'Send answer' }));
    expect(box).toHaveAccessibleDescription('Keep it under 2,000 characters.');
    expect(sent).toEqual([]);
  });

  it('AC-22: has no accessibility violations with a choice picked, Other open and an error showing', async () => {
    setUp([library, checks]);
    const { user } = await renderApp({ route });

    await user.click(await screen.findByRole('checkbox', { name: 'Other' }));
    await user.click(screen.getByRole('button', { name: 'Send answer' }));
    await screen.findByText('Pick an answer.');
    await expectNoAxeViolations(screen.getByRole('alert'));
  });

  it('AC-11: while the answer is on its way, Send answer shows it is busy and Skip waits', async () => {
    setUp([library], async () => {
      await delay('infinite');
      return new Response(null, { status: 204 });
    });
    const { user } = await renderApp({ route });

    await user.click(await screen.findByRole('radio', { name: 'date-fns' }));
    await user.click(screen.getByRole('button', { name: 'Send answer' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Send answer' })).toHaveAttribute('aria-disabled', 'true');
    });
    expect(screen.getByRole('button', { name: 'Skip' })).toBeDisabled();
  });
});
