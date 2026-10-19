import type { Meta, StoryObj } from '@storybook/react-vite';
import { Alert02Icon, CheckmarkCircle02Icon, GitPullRequestIcon, Settings02Icon } from '@hugeicons/core-free-icons';
import type { ReactNode } from 'react';
import { Button } from './button.tsx';
import { Icon } from './icon.tsx';
import { IconButton } from './icon-button.tsx';
import { NotificationItem } from './notification-item.tsx';
import {
  NotificationGroup,
  NotificationPanel,
  NotificationPanelContent,
  NotificationPanelNote,
  NotificationPanelSkeleton,
  NotificationPanelTrigger,
  NotificationTabs,
  NotificationTabsContent,
  NotificationTabsList,
} from './notification-panel.tsx';
import { Switch } from './switch.tsx';
import { TabsTrigger } from './tabs.tsx';

function Panel({ list, unread = 4 }: { list: ReactNode; unread?: number }) {
  return (
    <div className="flex h-160 items-end bg-sidebar p-4">
      <NotificationPanel defaultOpen>
        <NotificationPanelTrigger unread={unread} />
        <NotificationPanelContent
          actions={
            <>
              <Button size="sm" variant="ghost">
                Mark all read
              </Button>
              <IconButton variant="ghost" size="sm" label="Notification settings">
                <Icon icon={Settings02Icon} aria-hidden />
              </IconButton>
            </>
          }
          foot={
            <>
              <span className="flex items-center gap-2">
                <Switch id="dnd" />
                <label htmlFor="dnd">Do not disturb</label>
              </span>
              <span className="flex items-center gap-2">
                <Switch id="sounds" defaultChecked />
                <label htmlFor="sounds">Sounds</label>
              </span>
            </>
          }
        >
          <NotificationTabs defaultValue="all">
            <NotificationTabsList>
              <TabsTrigger value="all" count={unread}>
                All
              </TabsTrigger>
              <TabsTrigger value="needs-you" count={1}>
                Needs you
              </TabsTrigger>
            </NotificationTabsList>
            <NotificationTabsContent value="all">{list}</NotificationTabsContent>
            <NotificationTabsContent value="needs-you">{list}</NotificationTabsContent>
          </NotificationTabs>
        </NotificationPanelContent>
      </NotificationPanel>
    </div>
  );
}

const rows = (
  <>
    <NotificationGroup heading="Today">
      <NotificationItem
        icon={Alert02Icon}
        tone="warning"
        title="Claude wants to run a command"
        detail="PROJ-1423 · Add bulk archive · npm test -- content-list"
        time="2 min ago"
        unread
        onOpen={() => undefined}
        actions={
          <>
            <Button size="sm" variant="secondary">
              Allow once
            </Button>
            <Button size="sm" variant="ghost">
              Review
            </Button>
          </>
        }
      />
      <NotificationItem
        icon={CheckmarkCircle02Icon}
        tone="success"
        title="Session finished, ready for a pull request"
        detail="PROJ-1398 · Read receipts on analytics"
        time="40 min ago"
        unread
        onOpen={() => undefined}
      />
      <NotificationItem
        icon={GitPullRequestIcon}
        tone="neutral"
        title="Arjun M. requested your review"
        detail="api 977 · Rate-limit the export endpoint"
        time="1 h ago"
        unread
        onOpen={() => undefined}
      />
    </NotificationGroup>
    <NotificationGroup heading="Earlier">
      <NotificationItem
        icon={Alert02Icon}
        tone="danger"
        title="Checks failed on your pull request"
        detail="web-app 2836 · Fix the export"
        time="Yesterday"
        unread={false}
        onOpen={() => undefined}
      />
    </NotificationGroup>
  </>
);

const meta = {
  title: 'Components/NotificationPanel',
  component: Panel,
  args: { list: rows },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};
export const Loading: Story = { args: { list: <NotificationPanelSkeleton /> } };
export const Empty: Story = {
  args: { unread: 0, list: <NotificationPanelNote>No notifications yet.</NotificationPanelNote> },
};
export const LoadError: Story = {
  args: {
    unread: 0,
    list: (
      <NotificationPanelNote
        role="alert"
        action={
          <Button size="sm" variant="secondary">
            Try again
          </Button>
        }
      >
        Notifications didn’t load.
      </NotificationPanelNote>
    ),
  },
};
