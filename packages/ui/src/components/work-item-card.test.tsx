import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { AgentChip } from './agent-chip.tsx';
import {
  WorkItemBuild,
  WorkItemCard,
  WorkItemCardSkeleton,
  WorkItemTitle,
  WorkItemKey,
  WorkItemPriority,
} from './work-item-card.tsx';

function StoryCard() {
  return (
    <WorkItemCard
      itemKey="PROJ-1423"
      type="Story"
      assignee={{ initials: 'RD', label: 'Assigned to you' }}
      priority={{ level: 'high', label: 'High' }}
      due={{ label: 'Fri', soon: true }}
      title={<WorkItemTitle href="/sessions/1423">Add bulk archive to the content list</WorkItemTitle>}
      action={<AgentChip state="needs_you" href="/sessions/1423" />}
    />
  );
}

describe('WorkItemCard', () => {
  it('AC-15: shows the key, type, assignee, title, priority, due date and Claude’s state', async () => {
    const { container } = render(<StoryCard />);

    const card = screen.getByRole('article', { name: 'Add bulk archive to the content list' });
    expect(within(card).getByText('PROJ-1423')).toBeVisible();
    expect(within(card).getByText('Story')).toBeVisible();
    expect(within(card).getByRole('img', { name: 'Assigned to you' })).toHaveTextContent('RD');
    expect(within(card).getByRole('link', { name: 'Add bulk archive to the content list' })).toHaveAttribute(
      'href',
      '/sessions/1423',
    );
    expect(within(card).getByText('High')).toBeVisible();
    expect(within(card).getByText('Fri')).toBeVisible();
    expect(within(card).getByRole('link', { name: 'Needs you' })).toHaveAttribute('href', '/sessions/1423');
    await expectNoAxeViolations(container);
  });

  it('AC-16: without a session it offers "Build … with Claude" as an icon button', async () => {
    const user = userEvent.setup();
    const onBuild = vi.fn();
    const { container } = render(
      <WorkItemCard
        itemKey="PROJ-1377"
        type="Bug"
        bug
        priority={{ level: 'medium', label: 'Medium' }}
        due={{ label: 'Oct 28' }}
        title={<WorkItemTitle href="/tickets/1377">Search returns archived sites for guest users</WorkItemTitle>}
        action={<WorkItemBuild itemKey="PROJ-1377" onClick={onBuild} />}
      />,
    );

    expect(screen.getByText('Bug')).toBeVisible();
    expect(screen.queryByRole('link', { name: /needs you/i })).not.toBeInTheDocument();
    const build = screen.getByRole('button', { name: 'Build PROJ-1377 with Claude' });
    expect(build).toHaveAttribute('title', 'Build with Claude');
    await user.click(build);
    expect(onBuild).toHaveBeenCalledTimes(1);
    await expectNoAxeViolations(container);
  });

  it("AC-16: the build action can be the router's link", () => {
    render(
      <WorkItemBuild itemKey="PROJ-1377" asChild>
        <a href="/sessions/new?ticket=PROJ-1377">{/* The button fills in its sparkle. */}</a>
      </WorkItemBuild>,
    );

    expect(screen.getByRole('link', { name: 'Build PROJ-1377 with Claude' })).toHaveAttribute(
      'href',
      '/sessions/new?ticket=PROJ-1377',
    );
  });

  it('AC-17: Tab stops on the title, then on the action; the card itself is not a link', async () => {
    const user = userEvent.setup();
    render(<StoryCard />);

    await user.tab();
    expect(screen.getByRole('link', { name: 'Add bulk archive to the content list' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Needs you' })).toHaveFocus();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('AC-26: the loading form is hidden from screen readers (its size is checked in the browser)', async () => {
    const { container } = render(
      <section aria-label="To do" aria-busy>
        <WorkItemCardSkeleton />
        <WorkItemCardSkeleton />
      </section>,
    );

    const column = screen.getByRole('region', { name: 'To do' });
    expect(column).toHaveTextContent('');
    expect(within(column).queryByRole('article')).not.toBeInTheDocument();
    for (const card of column.children) expect(card).toHaveAttribute('aria-hidden', 'true');
    await expectNoAxeViolations(container);
  });

  it('lends its key and priority to the list view, with the same words (spec 008)', () => {
    render(
      <p>
        <WorkItemKey>PROJ-1423</WorkItemKey> <WorkItemPriority level="low" label="Lowest" />
      </p>,
    );

    expect(screen.getByText('PROJ-1423')).toBeVisible();
    expect(screen.getByText('Lowest')).toBeVisible();
  });
});
