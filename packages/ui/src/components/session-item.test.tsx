import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { SessionItem, sessionStateLabels, type SessionItemState } from './session-item.tsx';

const states = Object.keys(sessionStateLabels) as SessionItemState[];

describe('SessionItem', () => {
  it('AC-8: is one link with the title, the source and the state word', () => {
    render(<SessionItem href="/sessions/1" title="Add bulk archive" source="PROJ-1423" state="needs_you" />);

    const link = screen.getByRole('link', { name: 'Add bulk archive PROJ-1423 Needs you' });
    expect(link).toHaveAttribute('href', '/sessions/1');
  });

  it.each(states)('AC-9: tells the %s state in words, not colour alone', (state) => {
    render(<SessionItem href="#" title="Fix timezone shift" state={state} />);

    expect(screen.getByText(sessionStateLabels[state])).toBeVisible();
  });

  it('AC-9: names the five states the way the product spec does', () => {
    expect(sessionStateLabels).toEqual({
      needs_you: 'Needs you',
      working: 'Working',
      done: 'Done, ready for PR',
      pr_open: 'PR open',
      stopped: 'Stopped',
    });
  });

  it('keeps a long title readable as a tooltip, since the row cuts it to one line', () => {
    const title = 'Fix timezone shift in event cards and the calendar export';
    render(<SessionItem href="#" title={title} source="PR #2836" state="done" />);

    expect(screen.getByTitle(title)).toHaveTextContent(title);
    // The tooltip adds nothing to the link's name.
    expect(screen.getByRole('link', { name: `${title} PR #2836 Done, ready for PR` })).toBeVisible();
  });

  it('AC-8: shows only the state when the session has no source', () => {
    render(<SessionItem href="#" title="Tidy the README" state="working" />);

    expect(screen.getByRole('link', { name: 'Tidy the README Working' })).toBeVisible();
  });

  it('AC-14: renders the child element when asChild is set, keeping its attributes', () => {
    render(
      <SessionItem asChild title="Add bulk archive" source="PR #2836" state="done">
        {/* eslint-disable-next-line jsx-a11y/anchor-has-content -- asChild fills the anchor with the row */}
        <a href="/sessions/2" aria-current="page" />
      </SessionItem>,
    );

    const link = screen.getByRole('link', { name: 'Add bulk archive PR #2836 Done, ready for PR' });
    expect(link).toHaveAttribute('href', '/sessions/2');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('AC-9: has no accessibility violations in any state', async () => {
    const { container } = render(
      <nav aria-label="Sessions">
        {states.map((state) => (
          <SessionItem key={state} href="#" title={`A ${state} session`} source="PROJ-1" state={state} />
        ))}
      </nav>,
    );
    await expectNoAxeViolations(container);
  });
});
