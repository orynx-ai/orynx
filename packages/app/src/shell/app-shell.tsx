import { Outlet } from '@tanstack/react-router';
import { Button, Callout, cn } from '@devhub/ui';
import { SearchDialog } from '../features/search/components/search-dialog.tsx';
import { TicketDialog } from '../features/tickets/components/ticket-dialog.tsx';
import { usePlatform } from '../platform.tsx';
import { useConnectionStore } from '../stores/connection-store.ts';
import { focusMainContent, mainContentId } from './main-content.ts';
import { pageGutter } from './page-frame.tsx';
import { Sidebar } from './sidebar.tsx';
import { useGlobalShortcuts } from './use-shortcuts.ts';

/** Every screen: skip link, sidebar, then the page. Narrow windows stack the sidebar on top. */
export function AppShell() {
  useGlobalShortcuts();

  return (
    <div className="relative flex min-h-dvh flex-col bg-canvas text-foreground md:flex-row">
      <a
        href={`#${mainContentId}`}
        onClick={(event) => {
          // Move focus ourselves: the router would otherwise treat the hash as a navigation.
          event.preventDefault();
          focusMainContent();
        }}
        className="absolute start-2 -top-15 z-30 rounded-sm bg-primary px-3 py-2 font-medium text-primary-foreground no-underline focus:top-2"
      >
        Skip to content
      </a>
      <Sidebar />
      <main id={mainContentId} tabIndex={-1} className="flex min-w-0 flex-1 flex-col bg-canvas outline-none">
        <StaleBanner />
        <Outlet />
      </main>
      <SearchDialog />
      {/* One for every page, so it stays open after ⌘K closes (spec 022). */}
      <TicketDialog />
    </div>
  );
}

/** Shown when the server answered 401: it restarted, so this page holds an old token. */
function StaleBanner() {
  const stale = useConnectionStore((state) => state.stale);
  const platform = usePlatform();
  if (!stale) return null;

  return (
    <div className={cn('pt-4', pageGutter)}>
      <Callout
        tone="warning"
        role="alert"
        title="Orynx restarted"
        actions={
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              platform.reload();
            }}
          >
            Reload
          </Button>
        }
      >
        <span>Reload the page to reconnect.</span>
      </Callout>
    </div>
  );
}
