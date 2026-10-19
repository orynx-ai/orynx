import type { Meta, StoryObj } from '@storybook/react-vite';
import { File02Icon } from '@hugeicons/core-free-icons';
import { ContextChip, ContextList, ContextMore } from './context-chip.tsx';
import { SourceMark } from './source-mark.tsx';
import { Icon } from './icon.tsx';

const meta = {
  title: 'Components/ContextChip',
  component: ContextChip,
  args: { label: 'PROJ-1423', icon: <SourceMark source="jira" label="none" />, onRemove: () => undefined },
  decorators: [
    (Story) => (
      <ContextList aria-label="Context for Claude" className="max-w-xl">
        <Story />
      </ContextList>
    ),
  ],
} satisfies Meta<typeof ContextChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const JiraTicket: Story = {};
export const PullRequest: Story = {
  args: { label: 'web-app #2836', icon: <SourceMark source="github" label="none" /> },
};
export const SlackThread: Story = {
  args: { label: 'Neha K. in #web-platform', icon: <SourceMark source="slack" label="none" /> },
};
export const File: Story = { args: { label: 'bulk-archive-spec.pdf', icon: <Icon icon={File02Icon} /> } };
/** Longer than 300 px: the text is cut off, and the full text shows on hover. */
export const LongText: Story = {
  args: { label: 'release-notes-for-the-bulk-archive-change-and-the-api-errors.md', icon: <Icon icon={File02Icon} /> },
};
/** Two chips: both show, and no +N (spec 022, AC-18). */
export const Two: Story = {
  render: (args) => (
    <>
      <ContextChip {...args} />
      <ContextChip {...args} label="web-app #2836" icon={<SourceMark source="github" label="none" />} />
    </>
  ),
};
/**
 * Five chips: the first two, then +3 (spec 022, AC-19). At the toolbar's narrow width the chips cut their text so
 * the row stays one line, and +3 stays whole (AC-25).
 */
export const MoreThanTwo: Story = {
  render: (args) => (
    <>
      <ContextChip {...args} label="release-notes-for-the-bulk-archive-change.md" icon={<Icon icon={File02Icon} />} />
      <ContextChip {...args} label="web-app #2836" icon={<SourceMark source="github" label="none" />} />
      <ContextMore count={3} label="Show all 5 items of context" tooltip="Show all context" />
    </>
  ),
};
