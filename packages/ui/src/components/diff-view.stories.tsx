import type { Meta, StoryObj } from '@storybook/react-vite';
import { DiffView, type DiffLine } from './diff-view.tsx';

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
