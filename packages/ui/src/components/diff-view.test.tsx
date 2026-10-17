import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { DiffView, type DiffLine } from './diff-view.tsx';

const lines: DiffLine[] = [
  { kind: 'context', number: 41, text: 'export function ContentList({ items }: Props) {' },
  { kind: 'removed', number: 42, text: '  const [rows] = useState(items);' },
  { kind: 'added', number: 42, text: '  const { selected, toggle } = useSelection(items);' },
  { kind: 'added', number: 43, text: '  const archive = useBulkArchive();' },
  { kind: 'added', number: 44, text: '' },
  { kind: 'context', number: 45, text: '  return (' },
];

describe('DiffView', () => {
  it('AC-22: is a region named after the file, with the path, the counts and every line', async () => {
    const { container } = render(<DiffView path="src/content/ContentList.tsx" lines={lines} />);

    const region = screen.getByRole('region', { name: 'Changes in ContentList.tsx' });
    expect(within(region).getByText('src/content/ContentList.tsx')).toBeVisible();
    // The counts come from the lines: drawn as "+3 −1", read as words.
    expect(within(region).getByText('+3')).toBeVisible();
    expect(within(region).getByText('−1')).toBeVisible();
    expect(within(region).getByText('3 lines added, 1 line removed')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('AC-22: each line has its number, its sign and its code', () => {
    render(<DiffView path="src/content/ContentList.tsx" lines={lines} />);

    const code = screen.getByRole('region', { name: 'Changes in ContentList.tsx' }).querySelector('code');
    const rows = [...(code?.children ?? [])].map((row) => row.textContent);
    expect(rows).toEqual([
      '41 export function ContentList({ items }: Props) {',
      '42−  const [rows] = useState(items);',
      '42+  const { selected, toggle } = useSelection(items);',
      '43+  const archive = useBulkArchive();',
      // An empty line keeps a newline, so copying keeps the blank line.
      '44+\n',
      '45   return (',
    ]);
  });

  it('AC-23: the code can be scrolled sideways from the keyboard', () => {
    render(<DiffView path="src/content/ContentList.tsx" lines={lines} />);

    const scroller = screen.getByRole('region', { name: 'Changes in ContentList.tsx' }).querySelector('pre');
    expect(scroller).toHaveAttribute('tabindex', '0');
  });
});
