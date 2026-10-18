import type { Meta, StoryObj } from '@storybook/react-vite';
import { CheckListIcon, FileSearchIcon, PencilEdit01Icon, TerminalIcon } from '@hugeicons/core-free-icons';
import { ActivityList, ActivityStep } from './activity-step.tsx';
import { Icon } from './icon.tsx';

const meta = {
  title: 'Components/ActivityStep',
  component: ActivityStep,
  args: {
    icon: <Icon icon={FileSearchIcon} />,
    title: 'Read 6 files',
    detail: 'ContentList.tsx, contentApi.ts and 4 more',
  },
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
  args: {
    state: 'waiting',
    icon: <Icon icon={TerminalIcon} />,
    title: 'Wants to run npm test',
    detail: 'Waiting for your approval',
  },
};
export const Plain: Story = {
  args: { icon: <Icon icon={TerminalIcon} />, title: 'Run the linter', detail: undefined },
};
export const LongDetail: Story = {
  args: {
    state: 'done',
    icon: <Icon icon={PencilEdit01Icon} />,
    title: 'Edited 4 files',
    detail:
      'src/content/ContentList.tsx, src/content/api/contentApi.ts, src/content/useSelection.ts and src/content/__tests__/bulkArchive.test.ts',
  },
};
/** Claude's progress on the Session screen. */
export const Progress: Story = {
  render: () => (
    <>
      <ActivityStep
        state="done"
        icon={<Icon icon={FileSearchIcon} />}
        title="Read 6 files"
        detail="ContentList.tsx and 5 more"
      />
      <ActivityStep state="done" icon={<Icon icon={CheckListIcon} />} title="Planned the change" detail="4 steps" />
      <ActivityStep state="done" icon={<Icon icon={PencilEdit01Icon} />} title="Edited 4 files" detail="+142 −18" />
      <ActivityStep
        state="waiting"
        icon={<Icon icon={TerminalIcon} />}
        title="Wants to run npm test"
        detail="Waiting for you"
      />
    </>
  ),
};
