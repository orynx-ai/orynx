import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { DiffView, DiffViewSkeleton, type DiffLine } from './diff-view.tsx';

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
    // The folder muted, then the file's name (spec 048).
    expect(within(region).getByText('src/content/')).toHaveClass('text-muted-foreground');
    expect(within(region).getByText('ContentList.tsx')).toBeVisible();
    // The counts come from the lines: drawn as "+3 −1", read as words.
    expect(within(region).getByText('+3')).toBeVisible();
    expect(within(region).getByText('−1')).toBeVisible();
    expect(within(region).getByText('3 lines added, 1 line removed')).toBeInTheDocument();
    // The path can be copied from the header (the user's call, 19 Oct 2026).
    expect(within(region).getByRole('button', { name: 'Copy src/content/ContentList.tsx' })).toBeInTheDocument();
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

  it('AC-23: the code takes keyboard focus, so a wide diff can be scrolled with the keys', () => {
    render(<DiffView path="src/content/ContentList.tsx" lines={lines} />);

    const scroller = screen.getByRole('region', { name: 'Changes in ContentList.tsx' }).querySelector('pre');
    expect(scroller).toHaveAttribute('tabindex', '0');
    // Where focus lands is named by the file's path.
    expect(scroller).toHaveAccessibleName('src/content/ContentList.tsx');
  });

  it('AC-19 (spec 048): with Wrap lines, a long line wraps under its own code; without, it stays one line', () => {
    const wide = 'const response = await client.post<ArchiveResult>("/api/content/archive", { ids, notify: true });';
    const one: DiffLine[] = [{ kind: 'added', number: 13, text: wide }];
    const { rerender } = render(<DiffView path="src/api.ts" lines={one} />);
    expect(screen.getByText(wide)).not.toHaveClass('whitespace-pre-wrap');
    rerender(<DiffView path="src/api.ts" lines={one} wrap />);
    expect(screen.getByText(wide)).toHaveClass('whitespace-pre-wrap');
    // Its number and sign stay beside it.
    expect(screen.getByText(wide).parentElement).toHaveTextContent(`13+${wide}`);
  });

  it("AC-21 (spec 048): shows what the caller adds at the header's end, such as New file", async () => {
    const { container } = render(<DiffView path="src/new.ts" lines={lines} actions={<span>New file</span>} />);
    expect(within(screen.getByRole('region', { name: 'Changes in new.ts' })).getByText('New file')).toBeVisible();
    await expectNoAxeViolations(container);
  });

  it('AC-22: marks the gap between hunks with the hunk header, which is not counted', () => {
    render(
      <DiffView
        path="src/content/ContentList.tsx"
        lines={[
          { kind: 'hunk', text: '@@ -40,3 +40,3 @@' },
          { kind: 'removed', number: 42, text: '  const [rows] = useState(items);' },
          { kind: 'added', number: 42, text: '  const { selected } = useSelection(items);' },
          { kind: 'hunk', text: '@@ -90,2 +90,3 @@ export function ContentList' },
          { kind: 'added', number: 91, text: '  <ArchiveButton onClick={archive} />' },
        ]}
      />,
    );

    const region = screen.getByRole('region', { name: 'Changes in ContentList.tsx' });
    const rows = [...(region.querySelector('code')?.children ?? [])].map((row) => row.textContent);
    expect(rows).toEqual([
      '@@ -40,3 +40,3 @@',
      '42−  const [rows] = useState(items);',
      '42+  const { selected } = useSelection(items);',
      '@@ -90,2 +90,3 @@ export function ContentList',
      '91+  <ArchiveButton onClick={archive} />',
    ]);
    expect(within(region).getByText('2 lines added, 1 line removed')).toBeInTheDocument();
  });

  it('AC-26: the loading form is hidden from screen readers (its size is checked in the browser)', async () => {
    const { container } = render(<DiffViewSkeleton lines={6} />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container).toHaveTextContent('');
    await expectNoAxeViolations(container);
  });
});
