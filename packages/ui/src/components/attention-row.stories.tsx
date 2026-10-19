import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowUpRight01Icon, PlusSignIcon, SparklesIcon } from '@hugeicons/core-free-icons';
import {
  AttentionActions,
  AttentionList,
  AttentionRow,
  AttentionRowSkeleton,
  AttentionTitle,
  AttentionTitleButton,
} from './attention-row.tsx';
import { Icon } from './icon.tsx';
import { IconButton } from './icon-button.tsx';
import { Panel } from './panel.tsx';

/** An icon link out to the tool, as Home draws it (spec 020). */
function OpenIn({ href, label, name }: { href: string; label: string; name: string }) {
  return (
    <IconButton asChild variant="ghost" size="sm" label={label} aria-label={name}>
      <a href={href}>
        <Icon icon={ArrowUpRight01Icon} aria-hidden />
      </a>
    </IconButton>
  );
}

const meta = {
  title: 'Components/AttentionRow',
  component: AttentionRow,
  args: {
    source: 'github',
    title: <AttentionTitle href="#pr-2841">Lazy-load the people directory</AttentionTitle>,
    sub: 'web-app #2841 · by Priya S.',
    reason: 'Review requested · 2 d',
    reasonTone: 'warning',
    action: (
      <AttentionActions>
        <OpenIn href="#pr-2841" label="Open in GitHub" name="Open web-app #2841 in GitHub" />
      </AttentionActions>
    ),
  },
  decorators: [
    (Story) => (
      <Panel title="Needs your attention" meta="Sorted by how long it has waited" className="max-w-3xl">
        <AttentionList aria-label="Needs your attention" className="mt-3">
          <Story />
        </AttentionList>
      </Panel>
    ),
  ],
} satisfies Meta<typeof AttentionRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReviewRequested: Story = {};

/** A title that opens in GitHub, with the external link's arrow, cut off before it when long. */
export const OpensOutside: Story = {
  args: {
    title: (
      <AttentionTitle external href="https://github.com/acme/web-app/pull/2841">
        Lazy-load the people directory so the first paint stays under a second on slow laptops
      </AttentionTitle>
    ),
  },
};
/**
 * Home's row since spec 022: a Jira title that opens the ticket dialog (a button, no arrow) and one action, Add to
 * composer.
 */
export const OneAction: Story = {
  args: {
    source: 'jira',
    title: <AttentionTitleButton>Add bulk archive to the content list</AttentionTitleButton>,
    sub: 'PROJ-1423 · In progress',
    reason: 'Due Mon',
    action: (
      <AttentionActions>
        <IconButton variant="ghost" size="sm" label="Add to composer" aria-label="Add PROJ-1423 to the composer">
          <Icon icon={PlusSignIcon} aria-hidden />
        </IconButton>
      </AttentionActions>
    ),
  },
};
/** Home's list: a review request, a Slack message, a Jira ticket and a pull request with failing checks. */
export const Inbox: Story = {
  render: (args) => (
    <>
      <AttentionRow {...args} />
      <AttentionRow
        source="slack"
        title={
          <AttentionTitle href="#slack">
            Can you confirm the archive API returns 207 for partial failures?
          </AttentionTitle>
        }
        sub="Neha K. in #web-platform"
        reason="No reply · 3 h"
        action={
          <AttentionActions>
            <OpenIn href="#slack" label="Open in Slack" name="Open Neha K.'s message in Slack" />
          </AttentionActions>
        }
      />
      <AttentionRow
        source="jira"
        title={<AttentionTitle href="#ticket">Search returns archived sites for guest users</AttentionTitle>}
        sub="PROJ-1377 · Bug · High"
        reason="Due Fri"
        reasonTone="danger"
        action={
          <AttentionActions>
            <IconButton variant="ghost" size="sm" label="Ship" aria-label="Ship PROJ-1377">
              <Icon icon={SparklesIcon} aria-hidden />
            </IconButton>
            <OpenIn href="#ticket" label="Open in Jira" name="Open PROJ-1377 in Jira" />
          </AttentionActions>
        }
      />
      <AttentionRow
        source="github"
        title={<AttentionTitle href="#checks">Fix timezone shift in event cards</AttentionTitle>}
        sub="web-app #2836 · yours"
        reason="Checks failing"
        reasonTone="danger"
        action={
          <AttentionActions>
            <OpenIn href="#checks" label="Open in GitHub" name="Open web-app #2836 in GitHub" />
          </AttentionActions>
        }
      />
    </>
  ),
};
/** A long title and sub line stay on one line each, cut off with an ellipsis. */
export const LongText: Story = {
  args: {
    title: (
      <AttentionTitle href="#pr">
        Move the people directory, the org chart and the profile cards onto the new virtualised list
      </AttentionTitle>
    ),
    sub: 'platform-frontend-monorepo #12841 · by Priya Subramanian and 3 others',
  },
};
/** Under 480 px the reason pill moves under the sub line, and the action stays at the end. */
export const Narrow: Story = { args: { className: 'max-w-sm' } };
/** Loading: rows the same size as real ones. */
export const Loading: Story = {
  render: () => (
    <>
      <AttentionRowSkeleton />
      <AttentionRowSkeleton />
    </>
  ),
};
