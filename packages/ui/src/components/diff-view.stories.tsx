import type { Meta, StoryObj } from '@storybook/react-vite';
import { CheckboxBox } from './checkbox.tsx';
import { DiffView, DiffViewSkeleton, type DiffLine } from './diff-view.tsx';
import { Pill } from './pill.tsx';

const lines: DiffLine[] = [
  { kind: 'context', number: 41, text: 'export function ContentList({ items }: Props) {' },
  { kind: 'removed', number: 42, text: '  const [rows] = useState(items);' },
  { kind: 'added', number: 42, text: '  const { selected, toggle } = useSelection(items);' },
  { kind: 'added', number: 43, text: '  const archive = useBulkArchive();' },
  { kind: 'added', number: 44, text: '' },
  { kind: 'context', number: 45, text: '  return (' },
];

const meta = {
  title: 'Components/DiffView',
  component: DiffView,
  args: { path: 'src/content/ContentList.tsx', lines },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DiffView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Session screen's Changes tab, as the design system draws it. */
export const Changes: Story = {};
/** A line wider than the diff scrolls sideways inside it; the page never does. */
export const WideLine: Story = {
  args: {
    path: 'src/content/api/contentApi.ts',
    lines: [
      { kind: 'context', number: 12, text: 'export async function archiveItems(ids: string[]) {' },
      {
        kind: 'added',
        number: 13,
        text: "  const response = await client.post<ArchiveResult>('/api/content/archive', { ids, reason: 'bulk', notify: true, keepVersions: 3 });",
      },
      {
        kind: 'added',
        number: 14,
        text: '  return response.data.failed.length === 0 ? response.data : partial(response.data);',
      },
      { kind: 'context', number: 15, text: '}' },
    ],
  },
};
/** Wrap lines on (spec 048): the wide line wraps under its own code, beside its number. */
export const WideLineWrapped: Story = { args: { ...WideLine.args, wrap: true } };
/** What the Changes tab adds at the header's end: New file and Viewed (spec 048). */
export const WithActions: Story = {
  args: {
    path: 'packages/agent-builder/src/hooks/use-avatar-upload.ts',
    actions: (
      <>
        <Pill tone="success">New file</Pill>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <CheckboxBox id="viewed" />
          <label htmlFor="viewed">Viewed</label>
        </span>
      </>
    ),
  },
};
/** Only added lines: a new file. */
export const NewFile: Story = {
  args: {
    path: 'src/content/__tests__/bulkArchive.test.ts',
    lines: [
      { kind: 'added', number: 1, text: "import { describe, expect, it } from 'vitest';" },
      { kind: 'added', number: 2, text: '' },
      { kind: 'added', number: 3, text: "describe('bulk archive', () => {" },
    ],
  },
};
/** Two hunks: the header of each marks the gap; removed lines keep their old number. */
export const Hunks: Story = {
  args: {
    lines: [
      { kind: 'hunk', text: '@@ -40,4 +40,6 @@ export function ContentList({ items }: Props) {' },
      ...lines,
      { kind: 'hunk', text: '@@ -88,3 +92,4 @@ export function ContentList({ items }: Props) {' },
      { kind: 'context', number: 92, text: '      <Toolbar>' },
      { kind: 'added', number: 93, text: '        <ArchiveButton disabled={selected.size === 0} onClick={archive} />' },
      { kind: 'context', number: 94, text: '      </Toolbar>' },
    ],
  },
};
/** Loading: shown here above the real diff, with the same number of lines. */
export const Loading: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      <DiffViewSkeleton lines={args.lines.length} />
      <DiffView {...args} />
    </div>
  ),
};
