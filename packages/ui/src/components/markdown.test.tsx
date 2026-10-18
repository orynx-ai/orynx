import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Markdown } from './markdown.tsx';

const description = [
  'Content managers need to archive many items at once from the content list instead of one by one.',
  '',
  '### Acceptance criteria',
  '',
  '- Checkbox on each row, plus select all',
  '- Archive selected button in the toolbar',
  '- Partial failures show which items failed',
].join('\n');

describe('Markdown', () => {
  it('013 AC-9: lays out a ticket’s description as session.html draws it: a paragraph, a heading and a list', async () => {
    const { container } = render(<Markdown text={description} onOpenLink={() => undefined} />);
    expect(screen.getByText(/^Content managers need to archive many items/)).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: 'Acceptance criteria' })).toBeVisible();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Checkbox on each row, plus select all',
      'Archive selected button in the toolbar',
      'Partial failures show which items failed',
    ]);
    await expectNoAxeViolations(container);
  });

  it('013 AC-9: gives the largest heading the level asked for, so the page’s outline never skips one', () => {
    render(<Markdown text={'## Big\n\n#### Small'} onOpenLink={() => undefined} headingLevel={3} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Big' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 5, name: 'Small' })).toBeVisible();
  });

  it('013 AC-9: shows task items as boxes that say whether each is done, which you can’t change here', () => {
    render(<Markdown text={'- [x] Row selection\n- [ ] The toolbar button'} onOpenLink={() => undefined} />);
    const done = screen.getByRole('checkbox', { name: 'Row selection' });
    expect(done).toBeChecked();
    expect(done).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'The toolbar button' })).not.toBeChecked();
  });

  it('013 AC-10: opens an http or https link outside Orynx, and shows any other link as its text', async () => {
    const onOpenLink = vi.fn();
    render(
      <Markdown
        text={'Read [the design](https://figma.example.com/file) or [this](javascript:alert(1)).'}
        onOpenLink={onOpenLink}
      />,
    );
    await userEvent.setup().click(screen.getByRole('link', { name: 'the design' }));
    expect(onOpenLink).toHaveBeenCalledWith('https://figma.example.com/file');
    expect(screen.queryByRole('link', { name: 'this' })).toBeNull();
    expect(screen.getByText('this')).toBeVisible();
  });

  it('013 AC-10: shows HTML as text and never makes an element of it', () => {
    render(<Markdown text={'<img src=x onerror="alert(1)"> and <b>bold</b>'} onOpenLink={() => undefined} />);
    expect(screen.getByText('<img src=x onerror="alert(1)"> and <b>bold</b>')).toBeVisible();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('013 AC-10: lets the keyboard reach a code block and a table, so a wide one can be scrolled', async () => {
    const { container } = render(
      <Markdown
        text={'```\nconst a = 1;\n```\n\n| Field | Value |\n| --- | --- |\n| Owner | Content team |'}
        onOpenLink={() => undefined}
      />,
    );
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByText('const a = 1;').closest('pre')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('table').parentElement).toHaveFocus();
    expect(screen.getByRole('columnheader', { name: 'Field' })).toBeVisible();
    expect(screen.getByRole('cell', { name: 'Content team' })).toBeVisible();
    await expectNoAxeViolations(container);
  });

  it('013 AC-9: lays out code, bold, italic and strike inside a line, a quote and a rule', async () => {
    const { container } = render(
      <Markdown
        text={'Call `bulkArchive()` **now**, *carefully*, ~~never~~.\n\n> Said in the call.\n\n---'}
        onOpenLink={() => undefined}
      />,
    );
    expect(screen.getByText('bulkArchive()').tagName).toBe('CODE');
    expect(screen.getByText('now').tagName).toBe('STRONG');
    expect(screen.getByText('carefully').tagName).toBe('EM');
    expect(screen.getByText('never').tagName).toBe('S');
    expect(screen.getByText('Said in the call.').closest('blockquote')).not.toBeNull();
    expect(screen.getByRole('separator')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
