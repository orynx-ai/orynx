import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileList, FileListSkeleton, type ChangedFile } from './file-list.tsx';

const files: ChangedFile[] = [
  { path: 'src/content/ContentList.tsx', added: 68, removed: 9 },
  { path: 'src/content/api/contentApi.ts', added: 31, removed: 2 },
  { path: 'src/content/useSelection.ts', added: 22, removed: 7 },
  { path: 'src/content/__tests__/bulkArchive.test.ts', added: 21, removed: 0 },
];

const meta = {
  title: 'Components/FileList',
  component: FileList,
  args: { 'aria-label': 'Changed files', files, current: files[0]?.path, onSelect: () => undefined },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FileList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Session screen's Changes tab: picking a file shows it. */
export const Changes: Story = {
  render: (args) => {
    const [current, setCurrent] = useState(args.current);
    return <FileList {...args} current={current} onSelect={setCurrent} />;
  },
};
/** Long paths in a narrow column: only the folder part is cut off; the file name stays whole. */
export const LongPaths: Story = {
  args: {
    files: [
      {
        path: 'packages/platform/services/notifications/digest/src/templates/WeeklyDigestEmail.tsx',
        added: 140,
        removed: 0,
      },
      { path: 'packages/platform/services/notifications/digest/src/index.ts', added: 3, removed: 1 },
    ],
    current: 'packages/platform/services/notifications/digest/src/index.ts',
  },
  decorators: [
    (Story) => (
      <div className="max-w-64">
        <Story />
      </div>
    ),
  ],
};
/** More than 8 files (spec 013, Q6c): the list shows 8, and the rest scroll inside its box. */
export const ManyFiles: Story = {
  args: {
    maxRows: 8,
    files: Array.from({ length: 20 }, (_, n) => ({
      path: `src/content/parts/part-${String(n + 1).padStart(2, '0')}.tsx`,
      added: 3 + n,
      removed: n % 3,
    })),
    current: 'src/content/parts/part-01.tsx',
  },
};

export const Loading: Story = { render: () => <FileListSkeleton rows={4} /> };
