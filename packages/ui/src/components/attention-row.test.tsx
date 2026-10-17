import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import {
  AttentionAction,
  AttentionList,
  AttentionRow,
  AttentionRowSkeleton,
  AttentionTitle,
} from './attention-row.tsx';

function Inbox() {
  return (
    <AttentionList aria-label="Needs your attention">
      <AttentionRow
        source="github"
        title={
          <AttentionTitle href="https://github.com/acme/web-app/pull/2841">
            Lazy-load the people directory
          </AttentionTitle>
        }
        sub="web-app #2841 · by Priya S."
        reason="Review requested · 2 d"
        reasonTone="warning"
        action={<AttentionAction href="https://github.com/acme/web-app/pull/2841">Review</AttentionAction>}
      />
      <AttentionRow
        source="slack"
        title={
          <AttentionTitle href="https://acme.slack.com/archives/C1/p1">
            Can you confirm the archive API returns 207?
          </AttentionTitle>
        }
        sub="Neha K. in #web-platform"
        reason="No reply · 3 h"
        reasonTone="warning"
        action={<AttentionAction href="https://acme.slack.com/archives/C1/p1">Reply</AttentionAction>}
      />
    </AttentionList>
  );
}

describe('AttentionRow', () => {
  it('AC-18: shows where it comes from, what it is, why it needs you and what to do', async () => {
    const { container } = render(<Inbox />);

    const list = screen.getByRole('list', { name: 'Needs your attention' });
    const [review] = within(list).getAllByRole('listitem');
    if (review === undefined) throw new Error('The list has no rows.');
    const row = within(review);
    // The mark is for the eye; a screen reader hears the source's name.
    expect(row.getByText('GitHub')).toBeInTheDocument();
    expect(row.getByRole('link', { name: 'Lazy-load the people directory' })).toHaveAttribute(
      'href',
      'https://github.com/acme/web-app/pull/2841',
    );
    expect(row.getByText('web-app #2841 · by Priya S.')).toBeVisible();
    expect(row.getByText('Review requested · 2 d')).toBeVisible();
    expect(row.getByRole('link', { name: 'Review' })).toHaveAttribute(
      'href',
      'https://github.com/acme/web-app/pull/2841',
    );
    await expectNoAxeViolations(container);
  });

  it('AC-18: Tab stops on the title, then on the action', async () => {
    const user = userEvent.setup();
    render(<Inbox />);

    await user.tab();
    expect(screen.getByRole('link', { name: 'Lazy-load the people directory' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Review' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Can you confirm the archive API returns 207?' })).toHaveFocus();
  });

  it('AC-26: the loading rows hold the list’s place without being read out', async () => {
    const { container } = render(
      <AttentionList aria-label="Needs your attention" aria-busy>
        <AttentionRowSkeleton />
        <AttentionRowSkeleton />
      </AttentionList>,
    );

    const list = screen.getByRole('list', { name: 'Needs your attention' });
    expect(list).toHaveAttribute('aria-busy', 'true');
    expect(list).toHaveTextContent('');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("AC-18: the action can be the router's link, with its chevron inside", () => {
    render(
      <AttentionAction asChild>
        <a href="/sessions/42">Open session</a>
      </AttentionAction>,
    );

    const link = screen.getByRole('link', { name: 'Open session' });
    expect(link).toHaveAttribute('href', '/sessions/42');
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
