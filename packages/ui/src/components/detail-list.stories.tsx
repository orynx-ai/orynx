import type { Meta, StoryObj } from '@storybook/react-vite';
import { DetailList } from './detail-list.tsx';

const meta = {
  title: 'Components/DetailList',
  component: DetailList,
  args: {
    'aria-label': 'Jira details',
    items: [
      { term: 'Site', detail: 'your-team.atlassian.net' },
      { term: 'Account', detail: 'dev@example.com' },
      { term: 'Signed in with', detail: 'Personal API token' },
      { term: 'Orynx reads', detail: 'Issues assigned to you, your sprint, comments' },
      { term: 'Last checked', detail: '2 min ago' },
    ],
  },
  decorators: [
    (Story) => (
      <div className="max-w-120">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DetailList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A connected tool's details, as the connection dialog shows them. */
export const Default: Story = {};

/** A detail longer than its column wraps under itself, never under the terms. */
export const LongDetail: Story = {
  args: {
    items: [
      { term: 'Orynx writes', detail: 'Pushes session branches and opens pull requests on your click' },
      { term: 'Account', detail: 'a-very-long-account-name-that-has-no-spaces-at-all@example.com' },
    ],
  },
};
