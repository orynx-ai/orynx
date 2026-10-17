import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileText } from 'lucide-react';
import { ContextChip, ContextList } from './context-chip.tsx';
import { SourceMark } from './source-mark.tsx';

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
export const File: Story = { args: { label: 'bulk-archive-spec.pdf', icon: <FileText /> } };
/** Longer than 300 px: the text is cut off, and the full text shows on hover. */
export const LongText: Story = {
  args: { label: 'release-notes-for-the-bulk-archive-change-and-the-api-errors.md', icon: <FileText /> },
};
/** Several chips wrap onto a second row. */
export const Several: Story = {
  render: (args) => (
    <>
      <ContextChip {...args} />
      <ContextChip {...args} label="web-app #2836" icon={<SourceMark source="github" label="none" />} />
      <ContextChip {...args} label="Neha K. in #web-platform" icon={<SourceMark source="slack" label="none" />} />
      <ContextChip {...args} label="bulk-archive-spec.pdf" icon={<FileText />} />
    </>
  ),
};
