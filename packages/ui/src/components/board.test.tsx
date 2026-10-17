import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Board, BoardColumn } from './board.tsx';
import { Button } from './button.tsx';
import { EmptyState } from './empty-state.tsx';
import { WorkItemCard, WorkItemCardSkeleton, WorkItemTitle } from './work-item-card.tsx';

function DesignBoard() {
  return (
    <Board aria-label="Board">
      <BoardColumn status="todo" title="To do" count={1} aria-label="To do, 1 ticket">
        <WorkItemCard
          itemKey="PROJ-1377"
          type="Bug"
          bug
          title={<WorkItemTitle href="#">Search returns archived sites</WorkItemTitle>}
        />
      </BoardColumn>
      <BoardColumn
        status="in_review"
        title="In review"
        count={0}
        aria-label="In review, 0 tickets"
        action={
          <Button variant="ghost" size="icon-sm" aria-label="New ticket in In review">
            +
          </Button>
        }
      >
        <EmptyState title="Nothing in review">
          <span>Tickets move here when you open a pull request.</span>
        </EmptyState>
      </BoardColumn>
    </Board>
  );
}

describe('Board', () => {
  it('AC-30: is a named region that Tab reaches, so the keyboard can scroll it sideways', async () => {
    render(<DesignBoard />);

    await userEvent.tab();

    expect(screen.getByRole('region', { name: 'Board' })).toHaveFocus();
  });

  it('AC-31: each column is a region named with its count, headed by its name, with its count shown', () => {
    render(<DesignBoard />);

    const review = screen.getByRole('region', { name: 'In review, 0 tickets' });
    expect(within(review).getByRole('heading', { level: 2, name: 'In review' })).toBeVisible();
    expect(within(review).getByText('0')).toBeVisible();
    expect(within(review).getByText('Nothing in review')).toBeVisible();
    expect(within(review).getByRole('button', { name: 'New ticket in In review' })).toBeVisible();
    const todo = screen.getByRole('region', { name: 'To do, 1 ticket' });
    expect(within(todo).getByRole('article', { name: 'Search returns archived sites' })).toBeVisible();
  });

  it('a column without its own name is named by its heading, and its heading can sit lower in the outline', () => {
    render(
      <BoardColumn status="done" title="Done" headingLevel={3}>
        <span>Nothing done yet</span>
      </BoardColumn>,
    );

    expect(screen.getByRole('region', { name: 'Done' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: 'Done' })).toBeVisible();
  });

  it('AC-20: a loading column shows no count and says it’s busy', () => {
    render(
      <BoardColumn status="in_progress" title="In progress" busy>
        <WorkItemCardSkeleton />
      </BoardColumn>,
    );

    const column = screen.getByRole('region', { name: 'In progress' });
    expect(column).toHaveAttribute('aria-busy', 'true');
    expect(within(column).queryByText(/\d/)).toBeNull();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<DesignBoard />);
    await expectNoAxeViolations(container);
  });
});
