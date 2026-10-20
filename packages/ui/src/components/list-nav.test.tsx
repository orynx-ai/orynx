import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { ListNav, ListNavGroup, ListNavItem, ListNavSkeleton } from './list-nav.tsx';

describe('ListNav', () => {
  it('AC-2: lists items named by their label and described by their tag and description, and marks the current one', async () => {
    const { container } = render(
      <ListNav aria-label="Your skills">
        <ListNavItem
          label="Bug bash"
          tag="Used 4 times"
          description="Hunt for bugs in the code a ticket touches."
          current
          onClick={() => undefined}
        />
        <ListNavItem label="How we review" description="Review a pull request." onClick={() => undefined} />
      </ListNav>,
    );

    const list = screen.getByRole('list', { name: 'Your skills' });
    const items = within(list).getAllByRole('button');
    // The button shows only its label, so its name is what it shows; the rest is its description.
    expect(items.map((item) => item.textContent)).toEqual(['Bug bash', 'How we review']);
    expect(within(list).getByText('Hunt for bugs in the code a ticket touches.')).toBeVisible();
    expect(items[0]).toHaveAccessibleName('Bug bash');
    expect(items[0]).toHaveAccessibleDescription('Used 4 times Hunt for bugs in the code a ticket touches.');
    expect(items[1]).toHaveAccessibleDescription('Review a pull request.');
    expect(items[0]).toHaveAttribute('aria-current', 'true');
    expect(items[1]).not.toHaveAttribute('aria-current');
    await expectNoAxeViolations(container);
  });

  it('AC-3: opens an item on a click, or on Enter after Tab', async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    render(
      <ListNav aria-label="Your skills">
        <ListNavItem
          label="Bug bash"
          onClick={() => {
            open('bug-bash');
          }}
        />
        <ListNavItem
          label="How we review"
          onClick={() => {
            open('how-we-review');
          }}
        />
      </ListNav>,
    );

    await user.click(screen.getByRole('button', { name: 'How we review' }));
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Bug bash' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(open.mock.calls).toEqual([['how-we-review'], ['bug-bash']]);
  });

  it('AC-4: shows its search field above the list, and a line in place of the list when nothing is in it', () => {
    render(
      <ListNav aria-label="Your skills" search={<input aria-label="Search skills" />} empty="No skills match “rev”." />,
    );

    expect(screen.getByRole('textbox', { name: 'Search skills' })).toBeVisible();
    expect(screen.getByText('No skills match “rev”.')).toBeVisible();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('AC-15: has a loading form with rows the size of real items, hidden from screen readers', () => {
    const { container } = render(<ListNavSkeleton rows={3} />);
    const skeleton = container.firstElementChild;
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton?.querySelectorAll('[data-slot="list-nav-skeleton-item"]')).toHaveLength(3);
  });

  it('spec 035, AC-5, AC-8: groups items under a heading, each with a mark before its name and a status after', async () => {
    const { container } = render(
      <ListNav aria-label="Tools">
        <ListNavGroup label="Needs attention" count={1}>
          <ListNavItem
            label="Jira"
            description="Failing since 09:42"
            mark={<span>J</span>}
            status={<span>●</span>}
            current
            onClick={() => undefined}
          />
        </ListNavGroup>
        <ListNavGroup label="Syncing fine" count={1}>
          <ListNavItem label="GitHub" description="Synced 10:39" onClick={() => undefined} />
        </ListNavGroup>
      </ListNav>,
    );

    const attention = screen.getByRole('list', { name: 'Needs attention' });
    expect(screen.getByText('Needs attention').parentElement).toHaveTextContent('Needs attention1');
    const jira = within(attention).getByRole('button', { name: 'Jira' });
    expect(jira).toHaveAccessibleDescription('Failing since 09:42');
    expect(within(screen.getByRole('list', { name: 'Syncing fine' })).getAllByRole('button')).toHaveLength(1);
    const item = jira.closest('li');
    expect(item?.textContent).toBe('JJiraFailing since 09:42●');
    await expectNoAxeViolations(container);
  });
});
