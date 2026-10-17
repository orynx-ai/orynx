import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import type { InboxTarget } from '@devhub/contracts';
import {
  AttentionAction,
  AttentionList,
  AttentionRow,
  AttentionTitle,
  Button,
  EmptyState,
  Panel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { countKey, homeTabLabels, homeTabs, itemsInTab, type HomeTab } from '../inbox-tabs.ts';
import { actionLabel, reasonPill, subLine, tabCounts } from '../inbox-words.ts';
import { useInbox, type HomeItem } from '../queries.ts';
import { useNow } from '../use-now.ts';

const panelTitle = 'Needs your attention';

/**
 * Home's "Needs your attention" panel (spec 007): the tabs All, Jira and Pull requests with their counts, and
 * one row per ticket or pull request, longest wait first, as the server sorts them. The tab lives in the
 * address, so a reload stays on it.
 */
export function AttentionPanel() {
  const inbox = useInbox();
  const { inbox: inAddress } = useSearch({ from: '/' });
  const navigate = useNavigate();
  const now = useNow();
  const tab: HomeTab = inAddress ?? 'all';

  const tools = inbox.data?.tools;
  if (tools?.jira.state === 'not_connected' && tools.github.state === 'not_connected') {
    return (
      <Panel title={panelTitle}>
        <EmptyState
          title="Nothing needs you yet"
          action={
            <Button asChild size="sm">
              <Link to="/settings/$tab" params={{ tab: 'connections' }}>
                Connect your tools
              </Link>
            </Button>
          }
        >
          <span>Connect Jira, GitHub or Slack and the work that needs you shows up here.</span>
        </EmptyState>
      </Panel>
    );
  }

  const items = inbox.data?.items ?? [];
  const counts = inbox.data === undefined ? undefined : tabCounts(items);

  return (
    <Panel title={panelTitle} meta="Sorted by how long it has waited">
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const picked = homeTabs.find((each) => each === value) ?? 'all';
          // The panel sits low on Home, so picking a tab keeps the page where it is.
          void navigate({ to: '/', search: picked === 'all' ? {} : { inbox: picked }, resetScroll: false });
        }}
      >
        <TabsList aria-label="Filter by source">
          {homeTabs.map((value) => (
            <TabsTrigger key={value} value={value} {...(counts ? { count: counts[countKey(value)] } : {})}>
              {homeTabLabels[value]}
            </TabsTrigger>
          ))}
        </TabsList>
        {homeTabs.map((value) => (
          // Tab goes from the selected tab straight to the first row (AC-14, AC-33).
          <TabsContent key={value} value={value} tabIndex={-1}>
            <AttentionList>
              {itemsInTab(items, value).map((item) => (
                <Row key={item.id} item={item} now={now} />
              ))}
            </AttentionList>
          </TabsContent>
        ))}
      </Tabs>
    </Panel>
  );
}

function Row({ item, now }: { item: HomeItem; now: Date }) {
  const pill = reasonPill(item, now);
  return (
    <AttentionRow
      source={item.source}
      title={
        <TargetLink target={item.target} look="title" title={item.title}>
          {item.title}
        </TargetLink>
      }
      sub={subLine(item)}
      reason={
        <>
          <span aria-hidden>{pill.text}</span>
          <span className="sr-only">{pill.spoken}</span>
        </>
      }
      reasonTone={pill.tone}
      action={
        <TargetLink target={item.target} look="action">
          {actionLabel(item)}
        </TargetLink>
      }
    />
  );
}

/**
 * A row's title or action. Both go to the same place (006 AC-18): out to Jira or GitHub in a new tab, or to
 * the session inside DevHub.
 */
function TargetLink({
  target,
  look,
  title,
  children,
}: {
  target: InboxTarget;
  look: 'title' | 'action';
  /** The whole title, for when the row cuts it off. */
  title?: string;
  children: string;
}) {
  const platform = usePlatform();
  const Part = look === 'title' ? AttentionTitle : AttentionAction;
  if (target.kind === 'session') {
    return (
      <Part asChild title={title}>
        <Link to="/sessions/$sessionId" params={{ sessionId: target.sessionId }}>
          {children}
        </Link>
      </Part>
    );
  }
  return (
    <Part
      href={target.url}
      rel="noreferrer"
      title={title}
      onClick={(event) => {
        event.preventDefault();
        platform.openExternal(target.url);
      }}
    >
      {children}
    </Part>
  );
}
