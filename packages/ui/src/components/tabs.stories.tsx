import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs.tsx';

const meta = { title: 'Components/Tabs', component: Tabs } satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InboxSources: Story = {
  render: () => (
    <Tabs defaultValue="all">
      <TabsList aria-label="Inbox sources">
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
      <TabsContent value="all">Everything that needs you.</TabsContent>
      <TabsContent value="jira">Jira tickets.</TabsContent>
      <TabsContent value="prs">Pull requests.</TabsContent>
      <TabsContent value="slack">Slack messages.</TabsContent>
    </Tabs>
  ),
};

export const WithoutCounts: Story = {
  render: () => (
    <Tabs defaultValue="changes">
      <TabsList aria-label="Session views">
        <TabsTrigger value="changes">Changes</TabsTrigger>
        <TabsTrigger value="ticket">Ticket</TabsTrigger>
      </TabsList>
      <TabsContent value="changes">The diff.</TabsContent>
      <TabsContent value="ticket">The ticket.</TabsContent>
    </Tabs>
  ),
};

/** Counts on their way: blank bubbles keep their room, so the tabs don't move when the numbers come. */
export const CountsLoading: Story = {
  render: () => (
    <Tabs defaultValue="all">
      <TabsList aria-label="Filter by source">
        <TabsTrigger value="all" count={null}>
          All
        </TabsTrigger>
        <TabsTrigger value="jira" count={null}>
          Jira
        </TabsTrigger>
        <TabsTrigger value="prs" count={null}>
          Pull requests
        </TabsTrigger>
      </TabsList>
      <TabsContent value="all">Loading.</TabsContent>
      <TabsContent value="jira">Loading.</TabsContent>
      <TabsContent value="prs">Loading.</TabsContent>
    </Tabs>
  ),
};
