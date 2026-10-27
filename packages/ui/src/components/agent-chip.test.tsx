import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { AgentChip } from './agent-chip.tsx';
import type { SessionItemState } from './session-item.tsx';

describe('AgentChip', () => {
  it("AC-15, AC-11 (spec 047): links to the ticket's session and says Claude's state in the sidebar's words", async () => {
    const states: SessionItemState[] = ['needs_you', 'working', 'done', 'pr_open', 'pr_merged', 'pr_closed', 'stopped'];
    const { container } = render(
      <>
        {states.map((state) => (
          <AgentChip key={state} state={state} href={`/sessions/${state}`} />
        ))}
      </>,
    );

    expect(screen.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Needs you', '/sessions/needs_you'],
      ['Working', '/sessions/working'],
      ['Done, ready for PR', '/sessions/done'],
      ['PR open', '/sessions/pr_open'],
      ['PR merged', '/sessions/pr_merged'],
      ['PR closed', '/sessions/pr_closed'],
      ['Stopped', '/sessions/stopped'],
    ]);
    await expectNoAxeViolations(container);
  });

  it('says what a finished session is ready for, as the sidebar does (spec 031)', () => {
    render(<AgentChip state="done" ready="push" href="/sessions/1" />);

    expect(screen.getByRole('link', { name: 'Done, ready to push' })).toBeVisible();
  });

  it("AC-15: takes the router's link through asChild", () => {
    render(
      <AgentChip state="needs_you" asChild>
        <a href="/sessions/42" data-router-link="">
          {/* The chip fills in its dot and word. */}
        </a>
      </AgentChip>,
    );

    const link = screen.getByRole('link', { name: 'Needs you' });
    expect(link).toHaveAttribute('href', '/sessions/42');
    expect(link).toHaveAttribute('data-router-link');
  });
});
