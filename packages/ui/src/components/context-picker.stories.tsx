import type { Meta, StoryObj } from '@storybook/react-vite';
import { File01Icon, GitBranchIcon } from '@hugeicons/core-free-icons';
import {
  ContextKindItem,
  ContextPicker,
  ContextPickerContent,
  ContextPickerLabel,
  ContextPickerTrigger,
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
