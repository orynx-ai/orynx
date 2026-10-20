// Design: docs/design/screens/home.html — page bar (Synced line and Refresh; its Terminal: Design: none, the user's call, 20 Oct 2026), greeting (the waiting banner floats from the shell: the user's call, 20 Oct 2026), composer with + Add context and its pickers, quick starts and the "Needs your attention" panel
import { useRef } from 'react';
import { ComputerTerminal01Icon } from '@hugeicons/core-free-icons';
import { Icon, IconButton } from '@devhub/ui';
import { PageBar, PageBody, PageBreadcrumb } from '../../shell/page-frame.tsx';
import { SessionTerminal } from '../sessions/components/terminal/session-terminal.tsx';
import { terminalWords } from '../sessions/components/terminal/terminal-words.ts';
import { AttentionPanel } from './components/attention-panel.tsx';
import { HomeComposer } from './components/home-composer.tsx';
import { QuickStarts } from './components/quick-starts.tsx';
import { composerWords } from './composer-words.ts';
import { useComposerStore } from './store.ts';
import { SyncStatus } from './components/sync-status.tsx';

/**
 * Home answers "what should Claude build next?" and "who is waiting on me?". The waiting banner and the
 * composer with its quick starts (spec 015) start Claude; the attention list (spec 007) shows the Jira
 * tickets and pull requests waiting on you. Terminal in the page bar opens your shell in Orynx's home folder.
 */
export function HomeScreen() {
  // The heading follows Ask or Build (spec 031, Q8b).
  const mode = useComposerStore((state) => state.mode);
  const terminalButton = useRef<HTMLButtonElement>(null);
  const terminal = useRef<{ open: () => void }>(null);
  return (
    <>
      <PageBar
        breadcrumb={<PageBreadcrumb crumbs={[{ label: 'Home' }]} />}
        actions={
          <>
            <SyncStatus />
            {/* shortcut: shown on Windows too, where the server has no terminal and the dialog says it can't reach it. */}
            <IconButton
              ref={terminalButton}
              variant="ghost"
              size="sm"
              label={terminalWords.button}
              onClick={() => terminal.current?.open()}
            >
              <Icon icon={ComputerTerminal01Icon} aria-hidden />
            </IconButton>
            <SessionTerminal ref={terminal} session={null} returnTo={terminalButton} />
          </>
        }
      />
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
