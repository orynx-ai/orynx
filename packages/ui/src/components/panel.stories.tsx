import type { Meta, StoryObj } from '@storybook/react-vite';
import { Panel } from './panel.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs.tsx';

const meta = {
  title: 'Components/Panel',
  component: Panel,
  args: { title: 'Needs your attention', meta: 'Sorted by how long it has waited' },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Home's attention list: the head, the source tabs, then the rows. */
export const WithTabs: Story = {
  args: {
    children: (
      <Tabs defaultValue="all">
        <TabsList aria-label="Filter by source">
          <TabsTrigger value="all" count={14}>
            All
          </TabsTrigger>
          <TabsTrigger value="jira" count={5}>
            Jira
          </TabsTrigger>
          <TabsTrigger value="prs" count={5}>
            Pull requests
          </TabsTrigger>
          <TabsTrigger value="slack" count={4}>
            Slack
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="px-4 py-3 text-small text-muted-foreground">
          Rows go here.
        </TabsContent>
      </Tabs>
    ),
  },
};
export const HeadOnly: Story = { args: { meta: undefined, children: <p className="m-0 p-4">Rows go here.</p> } };
/** No head: a plain surface around a table or list that names itself. */
export const NoTitle: Story = {
  args: { title: undefined, meta: undefined, children: <p className="m-0 p-4">Tickets in Sprint 42</p> },
};
