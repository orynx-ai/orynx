// Design: docs/design/screens/home.html — page bar (Synced line and Refresh), greeting (the waiting banner floats from the shell: the user's call, 20 Oct 2026), composer with + Add context and its pickers, quick starts and the "Needs your attention" panel
import { PageBar, PageBody, PageBreadcrumb } from '../../shell/page-frame.tsx';
import { AttentionPanel } from './components/attention-panel.tsx';
import { HomeComposer } from './components/home-composer.tsx';
import { QuickStarts } from './components/quick-starts.tsx';
import { composerWords } from './composer-words.ts';
import { useComposerStore } from './store.ts';
import { SyncStatus } from './components/sync-status.tsx';

/**
 * Home answers "what should Claude build next?" and "who is waiting on me?". The waiting banner and the
 * composer with its quick starts (spec 015) start Claude; the attention list (spec 007) shows the Jira
 * tickets and pull requests waiting on you.
 */
export function HomeScreen() {
  // The heading follows Ask or Build (spec 031, Q8b).
  const mode = useComposerStore((state) => state.mode);
  return (
    <>
      <PageBar breadcrumb={<PageBreadcrumb crumbs={[{ label: 'Home' }]} />} actions={<SyncStatus />} />
      <PageBody width="narrow">
        {/* 48 px above the greeting (design system, --space-12): the body's 24 px plus 24 px here. */}
        <h1 className="m-0 mt-6 text-center font-serif text-display font-normal">{composerWords.heading[mode]}</h1>
        <HomeComposer />
        <QuickStarts />

        <AttentionPanel />
      </PageBody>
    </>
  );
}
