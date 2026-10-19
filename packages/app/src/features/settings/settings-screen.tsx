// Design: docs/design/screens/settings.html — page bar, title, local-first callout (closable: spec 020), tabs, the connection list, and the Coding agent (agent cards and modes), Repositories and Inbox rules tabs; docs/design/screens/skills.html — the Skills tab (spec 023)
import { useRef } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { SquareLock02Icon } from '@hugeicons/core-free-icons';
import { Tabs, TabsContent, TabsList, TabsTrigger, Callout, Icon } from '@devhub/ui';
import { PageBar, PageBody, PageBreadcrumb } from '../../shell/page-frame.tsx';
import { useUiStore } from '../../stores/ui-store.ts';
import { AppearancePanel } from './components/appearance-panel.tsx';
import { CodingAgentPanel } from './components/coding-agent-panel.tsx';
import { InboxRulesPanel } from './components/inbox-rules-panel.tsx';
import { RepositoriesPanel } from './components/repositories-panel.tsx';
import { SkillsBarActions } from './components/skills-bar-actions.tsx';
import { SkillsPanel } from './components/skills-panel.tsx';
import { ConnectionsPanel } from './components/connections-panel.tsx';
import { SettingsTabSchema, settingsTabLabels } from './tabs.ts';

export function SettingsScreen() {
  const { tab } = useParams({ from: '/settings/$tab' });
  const navigate = useNavigate();
  const noteHidden = useUiStore((state) => state.localFirstNoteHidden);
  const hideNote = useUiStore((state) => state.hideLocalFirstNote);
  const tabs = useRef<HTMLDivElement>(null);

  return (
    <>
      <PageBar
        breadcrumb={
          <PageBreadcrumb crumbs={[{ label: 'Settings', to: '/settings' }, { label: settingsTabLabels[tab] }]} />
        }
        actions={
          tab === 'skills' ? (
            <SkillsBarActions />
          ) : (
            // Under 768 px the bar has room only for the crumbs.
            <span className="text-small text-muted-foreground max-md:hidden">Changes save automatically</span>
          )
        }
      />
      <PageBody>
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-title-lg font-medium">Settings</h1>
          <p className="m-0 text-muted-foreground">Connect your tools and choose how Claude works in your repos.</p>
        </div>

        {noteHidden ? null : (
          <Callout
            tone="info"
            icon={<Icon icon={SquareLock02Icon} aria-hidden />}
            title="Everything stays on this computer"
            closeLabel="Hide this note"
            onClose={() => {
              // The button goes with the note, so focus moves on to the tab that's open (spec 020, AC-13).
              tabs.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
              hideNote();
            }}
          >
            <span>
              Tokens live in your OS keychain and the cache is a local file. Orynx talks only to Jira, GitHub, Slack and
              Claude.
            </span>
          </Callout>
        )}

        <Tabs
          value={tab}
          onValueChange={(value) => {
            void navigate({ to: '/settings/$tab', params: { tab: SettingsTabSchema.parse(value) } });
          }}
        >
          <TabsList ref={tabs} aria-label="Settings sections">
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
          <TabsContent value="skills" className="pt-6">
            <SkillsPanel />
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
