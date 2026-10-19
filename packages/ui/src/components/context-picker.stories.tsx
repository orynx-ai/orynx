import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { File01Icon, Folder01Icon, GitBranchIcon, PlusSignIcon } from '@hugeicons/core-free-icons';
import {
  ContextKindItem,
  ContextPicker,
  ContextPickerContent,
  ContextPickerLabel,
  ContextPickerTrigger,
  ContextSearch,
  type ContextSearchOption,
  type ContextSearchProps,
} from './context-picker.tsx';
import { Icon } from './icon.tsx';
import { SourceMark } from './source-mark.tsx';

const meta = {
  title: 'Components/ContextPicker',
  component: ContextPicker,
  // Open from the start, so the story shows the popup; Esc closes it and + opens it again.
  args: { defaultOpen: true },
  decorators: [
    (Story) => (
      <div className="min-h-120">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ContextPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The + button's first view (spec 015): the kinds, as `home.html` draws them, without Slack until spec 016. */
export const Kinds: Story = {
  render: (args) => (
    <ContextPicker {...args}>
      <ContextPickerTrigger />
      <ContextPickerContent
        view="kinds"
        aria-label="Add context"
        foot="Tip: you can also paste a Jira key or a pull request link into the box."
      >
        <ContextPickerLabel>Add context for Claude</ContextPickerLabel>
        <ContextKindItem
          icon={<Icon icon={GitBranchIcon} className="text-muted-foreground" />}
          description="The folder Claude works in"
          leadsOn
        >
          Git repository
        </ContextKindItem>
        <ContextKindItem icon={<SourceMark source="jira" label="none" />} description="Search by key or title" leadsOn>
          Jira ticket
        </ContextKindItem>
        <ContextKindItem
          icon={<SourceMark source="github" label="none" />}
          description="Search by repo, number or title"
          leadsOn
        >
          Pull request
        </ContextKindItem>
        <ContextKindItem
          icon={<Icon icon={File01Icon} className="text-muted-foreground" />}
          description="Text files up to 100 KB"
        >
          File from this computer
        </ContextKindItem>
      </ContextPickerContent>
    </ContextPicker>
  ),
};

const tickets: ContextSearchOption[] = [
  {
    value: 'PROJ-1423',
    label: 'PROJ-1423',
    description: 'Add bulk archive to the content list · In progress',
    mark: <SourceMark source="jira" label="none" />,
    added: true,
  },
  {
    value: 'PROJ-1377',
    label: 'PROJ-1377',
    description: 'Keyboard focus is lost after closing the people filter · To do',
    mark: <SourceMark source="jira" label="none" />,
  },
  {
    value: 'PROJ-1290',
    label: 'PROJ-1290',
    description: 'Tidy the footer links · To do',
    mark: <SourceMark source="jira" label="none" />,
  },
];

/** One kind's list as the page drives it: it narrows the options by the search. */
function List(props: Partial<ContextSearchProps> & { all?: ContextSearchOption[] }) {
  const { all = tickets, ...rest } = props;
  const [query, setQuery] = useState('');
  const options = all.filter((option) =>
    `${option.label} ${option.description ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <ContextPicker defaultOpen>
      <ContextPickerTrigger />
      <ContextPickerContent view="list" aria-label={rest.title ?? 'Jira ticket'}>
        <ContextSearch
          title="Jira ticket"
          count={`${String(options.length)} open`}
          onBack={() => undefined}
          searchLabel="Search tickets by key or title"
          query={query}
          onQueryChange={setQuery}
          options={options}
          select="many"
          onPick={() => undefined}
          emptyText="No matches. Try a key like PROJ-1423 or a repo name."
          note="Claude gets the summary, description, comments and linked issues."
          {...rest}
        />
      </ContextPickerContent>
    </ContextPicker>
  );
}

/** A kind's list, with the ticket already added checked (AC-7, AC-9). */
export const TicketList: Story = { render: () => <List /> };

/** Nothing matches the search (AC-10). */
export const NoMatches: Story = { render: () => <List all={[]} /> };

/** The first sync is still running: three rows the size of real ones (Q15a). */
export const Loading: Story = { render: () => <List all={[]} loading count={undefined} /> };

/** Jira isn't connected: one line in place of the search and the list (AC-32). */
export const NotConnected: Story = {
  render: () => (
    <List
      count={undefined}
      notice={
        <a href="#settings" className="text-info underline">
          Connect Jira in Settings to add tickets.
        </a>
      }
    />
  ),
};

/** The folders, ending in Add local folder (AC-13, AC-16): one is picked, so each has a radio. */
export const Folders: Story = {
  render: () => (
    <List
      select="one"
      title="Git repository"
      count="2 folders"
      searchLabel="Search folders"
      note="Claude works on a new branch in a worktree of this folder."
      all={[
        {
          value: 'web-app',
          label: 'web-app',
          description: '~/code/web-app',
          mark: <Icon icon={Folder01Icon} className="text-muted-foreground" />,
          added: true,
        },
        {
          value: 'api',
          label: 'api',
          description: '~/code/api',
          mark: <Icon icon={Folder01Icon} className="text-muted-foreground" />,
        },
      ]}
      extra={{ label: 'Add local folder…', icon: <Icon icon={PlusSignIcon} />, onSelect: () => undefined }}
    />
  ),
};
