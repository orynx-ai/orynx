// Design: docs/design/screens/settings.html — page bar, title, local-first callout, tabs and the connection list
import { useNavigate, useParams } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { Callout, Tabs, TabsContent, TabsList, TabsTrigger } from '@devhub/ui';
import { PageBar, PageBody, PageBreadcrumb } from '../../shell/page-frame.tsx';
import { AppearancePanel } from './components/appearance-panel.tsx';
import { CodingAgentPanel } from './components/coding-agent-panel.tsx';
import { InboxRulesPanel } from './components/inbox-rules-panel.tsx';
import { RepositoriesPanel } from './components/repositories-panel.tsx';
import { ConnectionsPanel } from './components/connections-panel.tsx';
import { SettingsTabSchema, settingsTabLabels } from './tabs.ts';

export function SettingsScreen() {
  const { tab } = useParams({ from: '/settings/$tab' });
  const navigate = useNavigate();

  return (
    <>
      <PageBar
        breadcrumb={
          <PageBreadcrumb crumbs={[{ label: 'Settings', to: '/settings' }, { label: settingsTabLabels[tab] }]} />
        }
        // Under 768 px the bar has room only for the crumbs.
        actions={<span className="text-small text-muted-foreground max-md:hidden">Changes save automatically</span>}
      />
      <PageBody>
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-title-lg font-medium">Settings</h1>
          <p className="m-0 text-muted-foreground">Connect your tools and choose how Claude works in your repos.</p>
        </div>

        <Callout tone="info" icon={<Lock aria-hidden />} title="Everything stays on this computer">
          <span>
            Tokens live in your OS keychain and the cache is a local file. DevHub talks only to Jira, GitHub, Slack and
            Claude.
          </span>
        </Callout>

        <Tabs
          value={tab}
          onValueChange={(value) => {
            void navigate({ to: '/settings/$tab', params: { tab: SettingsTabSchema.parse(value) } });
          }}
        >
          <TabsList aria-label="Settings sections">
            {SettingsTabSchema.options.map((value) => (
              <TabsTrigger key={value} value={value}>
                {settingsTabLabels[value]}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="connections" className="pt-6">
            <ConnectionsPanel />
          </TabsContent>
          <TabsContent value="coding-agent" className="pt-6">
            <CodingAgentPanel />
          </TabsContent>
          <TabsContent value="repositories" className="pt-6">
            <RepositoriesPanel />
          </TabsContent>
          <TabsContent value="inbox-rules" className="pt-6">
            <InboxRulesPanel />
          </TabsContent>
          <TabsContent value="appearance" className="pt-6">
            <AppearancePanel />
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}
