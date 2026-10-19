// Design: docs/design/screens/home.html — page bar (Synced line and Refresh), waiting banner, greeting, composer with + Add context and its pickers, quick starts and the "Needs your attention" panel
import { PageBar, PageBody, PageBreadcrumb } from '../../shell/page-frame.tsx';
import { AttentionPanel } from './components/attention-panel.tsx';
import { HomeComposer } from './components/home-composer.tsx';
import { QuickStarts } from './components/quick-starts.tsx';
import { WaitingBanner } from './components/waiting-banner.tsx';
import { SyncStatus } from './components/sync-status.tsx';

/**
 * Home answers "what should Claude build next?" and "who is waiting on me?". The waiting banner and the
 * composer with its quick starts (spec 015) start Claude; the attention list (spec 007) shows the Jira
 * tickets and pull requests waiting on you.
 */
export function HomeScreen() {
  return (
    <>
      <PageBar breadcrumb={<PageBreadcrumb crumbs={[{ label: 'Home' }]} />} actions={<SyncStatus />} />
      <PageBody width="narrow">
        <WaitingBanner />
        {/* 48 px above the greeting (design system, --space-12): the body's 24 px plus 24 px here. */}
        <h1 className="m-0 mt-6 text-center font-serif text-display font-normal">What should we ship today?</h1>
        <HomeComposer />
        <QuickStarts />

        <AttentionPanel />
      </PageBody>
    </>
  );
}
