import type { Meta, StoryObj } from '@storybook/react-vite';
import { CheckListIcon, FileSearchIcon, PencilEdit01Icon, TerminalIcon } from '@hugeicons/core-free-icons';
import { ActivityGroup, ActivityList, ActivityStep } from './activity-step.tsx';
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
/** A step with more to show: its title is a button. */
export const Openable: Story = { args: { state: 'done', onOpen: () => undefined } };
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

/** A step's rows, as an open group shows them. */
const fixes = (
  <ActivityList aria-label="Apply fixes">
    <ActivityStep
      state="done"
      icon={<Icon icon={FileSearchIcon} />}
      title="Read 2 files"
      detail="AGENTS.md and CLAUDE.md"
    />
    <ActivityStep
      state="done"
      icon={<Icon icon={PencilEdit01Icon} />}
      title="Edited 3 files"
      detail="agent-settings-dialog.tsx, agent-settings-form.tsx and spec.md"
    />
  </ActivityList>
);

/** What Claude did, by step (spec 048): done steps closed, the one Claude is on open. */
export const Groups: Story = {
  render: () => (
    <>
      <ActivityGroup
        state="done"
        icon={<Icon icon={CheckListIcon} />}
        title="Read comments"
        summary="Read 3 files"
        time="1 min"
      >
        {fixes}
      </ActivityGroup>
      <ActivityGroup
        state="done"
        icon={<Icon icon={PencilEdit01Icon} />}
        title="Apply fixes"
        summary="Edited 3 files"
        time="18 min"
        defaultOpen
      >
        {fixes}
      </ActivityGroup>
      <ActivityGroup icon={<Icon icon={TerminalIcon} />} title="Run tests" summary="Running npm test" defaultOpen>
        <ActivityList aria-label="Run tests">
          <ActivityStep icon={<Icon icon={TerminalIcon} />} title="Running a command" detail="npm test" />
        </ActivityList>
      </ActivityGroup>
    </>
  ),
};

/** The step Claude is on, waiting for you. */
export const GroupWaiting: Story = {
  render: () => (
    <ActivityGroup
      state="waiting"
      icon={<Icon icon={TerminalIcon} />}
      title="Run tests"
      summary="Wants to run npm test"
      defaultOpen
    >
      <ActivityList aria-label="Run tests">
        <ActivityStep
          state="waiting"
          icon={<Icon icon={TerminalIcon} />}
          title="Wants to run npm test"
          detail="Waiting for you"
        />
      </ActivityList>
    </ActivityGroup>
  ),
};

/** Long words cut the summary to one line; the step's words wrap. */
export const GroupLong: Story = {
  render: () => (
    <ActivityGroup
      state="done"
      icon={<Icon icon={PencilEdit01Icon} />}
      title="Apply the review fixes"
      summary="agent-settings-dialog.tsx, agent-settings-form.tsx, use-avatar-upload.ts, spec.md and 3 more"
      time="1 h 5 min"
    >
      {fixes}
    </ActivityGroup>
  ),
};
