import type { Meta, StoryObj } from '@storybook/react-vite';
import { HistoryList, HistoryRow } from './history-row.tsx';

const meta = {
  title: 'Components/HistoryRow',
  component: HistoryRow,
  args: {
    tone: 'success',
    time: '10:41',
    summary: '3 new · 1 updated',
    duration: '1.2s',
    status: 'succeeded',
    children: <span>PROJ-1431 · Add bulk archive to the content list</span>,
  },
  decorators: [
    (Story) => (
      <HistoryList aria-label="Sync history">
        <Story />
      </HistoryList>
    ),
  ],
} satisfies Meta<typeof HistoryRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Worked: Story = {};
export const Open: Story = { args: { defaultOpen: true } };
export const NothingChanged: Story = {
  args: { summary: 'No changes', summaryTone: 'muted', children: <span>Checked everything. Nothing changed.</span> },
};
export const Failed: Story = {
  args: {
    tone: 'danger',
    time: '09:57',
    summary: 'Failed · token refused',
    summaryTone: 'danger',
    duration: '0.3s',
    status: 'failed',
    defaultOpen: true,
    children: <span>Jira refused Orynx’s saved token.</span>,
  },
};
/** In a list of every tool's runs, the tool's name leads the summary. */
export const WithTool: Story = { args: { lead: 'GitHub', summary: '1 new · 2 updated · 1 removed' } };
export const LongSummary: Story = {
  args: { summary: '48 new · 12 updated · 9 removed, from a sync after a week away with every repository' },
};
