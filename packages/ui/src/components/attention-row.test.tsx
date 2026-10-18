import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LinkSquare02Icon, SparklesIcon } from '@hugeicons/core-free-icons';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Icon } from './icon.tsx';
import { IconButton } from './icon-button.tsx';
import {
  AttentionActions,
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
        action={
          <AttentionActions>
            <IconButton
              asChild
              variant="ghost"
              size="sm"
              label="Open in GitHub"
              aria-label="Open web-app #2841 in GitHub"
            >
              <a href="https://github.com/acme/web-app/pull/2841">
                <Icon icon={LinkSquare02Icon} aria-hidden />
              </a>
            </IconButton>
          </AttentionActions>
        }
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
        action={
          <AttentionActions>
            <IconButton variant="ghost" size="sm" label="Ship" aria-label="Ship PROJ-1377">
              <Icon icon={SparklesIcon} aria-hidden />
            </IconButton>
            <IconButton asChild variant="ghost" size="sm" label="Open in Slack" aria-label="Open the message in Slack">
              <a href="https://acme.slack.com/archives/C1/p1">
                <Icon icon={LinkSquare02Icon} aria-hidden />
              </a>
            </IconButton>
          </AttentionActions>
        }
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
    expect(row.getByRole('link', { name: 'Open web-app #2841 in GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/acme/web-app/pull/2841',
    );
    await expectNoAxeViolations(container);
  });

  it('a title that opens outside Orynx shows the arrow and keeps its name', async () => {
    const { container } = render(
      <AttentionList aria-label="Needs your attention">
        <AttentionRow
          source="github"
          title={
            <AttentionTitle external href="https://github.com/acme/web-app/pull/2841">
              Lazy-load the people directory
            </AttentionTitle>
          }
          sub="web-app #2841 · by Priya S."
          reason="Review requested · 2 d"
          reasonTone="warning"
        />
      </AttentionList>,
    );
    const link = screen.getByRole('link', { name: 'Lazy-load the people directory' });
    expect(link.querySelector('svg')).not.toBeNull();
    await expectNoAxeViolations(container);
  });

  it('AC-18, AC-14 (spec 020): Tab stops on the title, then on each action, which shows its words in a tooltip', async () => {
    const user = userEvent.setup();
    render(<Inbox />);

    await user.tab();
    expect(screen.getByRole('link', { name: 'Lazy-load the people directory' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Open web-app #2841 in GitHub' })).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Open in GitHub');
    await user.tab();
    expect(screen.getByRole('link', { name: 'Can you confirm the archive API returns 207?' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Ship PROJ-1377' })).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Ship');
    await user.tab();
    expect(screen.getByRole('link', { name: 'Open the message in Slack' })).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Open in Slack');
  });

  it('AC-26: the loading rows are hidden from screen readers (their size is checked in the browser)', async () => {
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
});
