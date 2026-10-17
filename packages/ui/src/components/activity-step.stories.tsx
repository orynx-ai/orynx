import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileSearch, ListChecks, Pencil, Terminal } from 'lucide-react';
import { ActivityList, ActivityStep } from './activity-step.tsx';

const meta = {
  title: 'Components/ActivityStep',
  component: ActivityStep,
  args: { icon: <FileSearch />, title: 'Read 6 files', detail: 'ContentList.tsx, contentApi.ts and 4 more' },
  decorators: [
    (Story) => (
      <ActivityList aria-label="Claude's progress" className="max-w-md">
        <Story />
      </ActivityList>
    ),
  ],
} satisfies Meta<typeof ActivityStep>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Done: Story = { args: { state: 'done' } };
export const Waiting: Story = {
  args: { state: 'waiting', icon: <Terminal />, title: 'Wants to run npm test', detail: 'Waiting for your approval' },
};
export const Plain: Story = { args: { icon: <Terminal />, title: 'Run the linter', detail: undefined } };
export const LongDetail: Story = {
  args: {
    state: 'done',
    icon: <Pencil />,
    title: 'Edited 4 files',
    detail:
      'src/content/ContentList.tsx, src/content/api/contentApi.ts, src/content/useSelection.ts and src/content/__tests__/bulkArchive.test.ts',
  },
};
/** Claude's progress on the Session screen. */
export const Progress: Story = {
  render: () => (
    <>
      <ActivityStep state="done" icon={<FileSearch />} title="Read 6 files" detail="ContentList.tsx and 5 more" />
      <ActivityStep state="done" icon={<ListChecks />} title="Planned the change" detail="4 steps" />
      <ActivityStep state="done" icon={<Pencil />} title="Edited 4 files" detail="+142 −18" />
      <ActivityStep state="waiting" icon={<Terminal />} title="Wants to run npm test" detail="Waiting for you" />
    </>
  ),
};
