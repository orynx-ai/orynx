import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Pagination, pagerItems } from './pagination.tsx';

const pageLink = (page: number, children: ReactNode) => <a href={`#page-${String(page)}`}>{children}</a>;

/** The names of the pager's links, in order. */
function linkNames() {
  const nav = screen.getByRole('navigation', { name: 'Pages' });
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.getAttribute('aria-label') ?? link.textContent);
}

describe('Pagination', () => {
  it('Q10f: shows Previous, the page numbers and Next, and marks the current page', async () => {
    const { container } = render(<Pagination page={2} pageCount={3} pageLink={pageLink} />);

    expect(linkNames()).toEqual(['Previous page', '1', '2', '3', 'Next page']);
    expect(screen.getByRole('link', { name: '2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '1' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute('href', '#page-1');
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '#page-3');
    await expectNoAxeViolations(container);
  });

  it('Q10f: Previous is unavailable on the first page and Next on the last, and Tab skips them', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Pagination page={1} pageCount={3} pageLink={pageLink} />);

    const previous = screen.getByRole('link', { name: 'Previous page' });
    expect(previous).toHaveAttribute('aria-disabled', 'true');
    expect(previous).not.toHaveAttribute('href');
    await user.tab();
    expect(screen.getByRole('link', { name: '1' })).toHaveFocus();

    rerender(<Pagination page={3} pageCount={3} pageLink={pageLink} />);
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute('href', '#page-2');
  });

  it('Q10f: past 7 pages, keeps the first, the last and the pages around the current one', () => {
    const { rerender } = render(<Pagination page={10} pageCount={19} pageLink={pageLink} />);
    expect(linkNames()).toEqual(['Previous page', '1', '9', '10', '11', '19', 'Next page']);

    rerender(<Pagination page={1} pageCount={19} pageLink={pageLink} />);
    expect(linkNames()).toEqual(['Previous page', '1', '2', '3', '4', '5', '19', 'Next page']);

    rerender(<Pagination page={19} pageCount={19} pageLink={pageLink} />);
    expect(linkNames()).toEqual(['Previous page', '1', '15', '16', '17', '18', '19', 'Next page']);
  });

  it('Q10f: shows nothing for a single page', () => {
    const { container } = render(<Pagination page={1} pageCount={1} pageLink={pageLink} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('pagerItems', () => {
  const shown = (page: number, count: number, narrow: boolean) =>
    pagerItems(page, count)
      .filter((item) => (narrow ? item.narrow : item.wide))
      .map((item) => (item.kind === 'gap' ? '…' : String(item.page)))
      .join(' ');

  it('Q10f: wide, shows every page up to 7, then the first, the last and up to five around the current one', () => {
    expect(shown(3, 7, false)).toBe('1 2 3 4 5 6 7');
    expect(shown(5, 19, false)).toBe('1 … 4 5 6 … 19');
    expect(shown(4, 19, false)).toBe('1 2 3 4 5 … 19');
    expect(shown(16, 19, false)).toBe('1 … 15 16 17 18 19');
  });

  it('Q10f: under 480 px, shows only the first, the last, the current page and its neighbours', () => {
    expect(shown(1, 7, true)).toBe('1 2 … 7');
    expect(shown(4, 7, true)).toBe('1 … 3 4 5 … 7');
    expect(shown(5, 19, true)).toBe('1 … 4 5 6 … 19');
    expect(shown(1, 19, true)).toBe('1 2 … 19');
    expect(shown(2, 3, true)).toBe('1 2 3');
    expect(shown(3, 5, true)).toBe('1 2 3 4 5');
  });

  it('AC-11: Previous and Next show their words in a tooltip, since under 480 px only the arrow shows', async () => {
    const user = userEvent.setup();
    render(<Pagination page={2} pageCount={3} pageLink={pageLink} />);

    await user.tab();
    expect(screen.getByRole('link', { name: 'Previous page' })).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Previous page');
  });
});
