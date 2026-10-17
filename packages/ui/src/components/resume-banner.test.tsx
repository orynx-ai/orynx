import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { ResumeBanner } from './resume-banner.tsx';

describe('ResumeBanner', () => {
  it('AC-24: is one link to the session, read as its title, detail and action', async () => {
    const { container } = render(
      <ResumeBanner
        href="/sessions/1423"
        title="Claude is waiting for your approval"
        detail="PROJ-1423 · Add bulk archive · wants to run npm test"
      />,
    );

    const link = screen.getByRole('link', {
      name: 'Claude is waiting for your approval PROJ-1423 · Add bulk archive · wants to run npm test Review',
    });
    expect(link).toHaveAttribute('href', '/sessions/1423');
    // "Review" looks like a button but is part of the one link, so there's nothing else to press.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('AC-24: takes one Tab stop', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ResumeBanner href="/sessions/1423" title="Claude is waiting for your approval" detail="PROJ-1423" />
        <button type="button">After</button>
      </>,
    );

    await user.tab();
    expect(screen.getByRole('link')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  it("AC-24: takes the router's link through asChild, and its own action word", () => {
    render(
      <ResumeBanner asChild title="Claude is waiting for your approval" detail="PROJ-1398" action="Open">
        <a href="/sessions/1398">{/* The banner fills in its icon and words. */}</a>
      </ResumeBanner>,
    );

    expect(screen.getByRole('link', { name: /Open$/ })).toHaveAttribute('href', '/sessions/1398');
  });
});
