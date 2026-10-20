import { Outlet, useRouterState } from '@tanstack/react-router';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { Button, Toast } from '@devhub/ui';
import { WaitingBanner } from '../features/home/components/waiting-banner.tsx';
import { PopUps } from '../features/notifications/components/pop-ups.tsx';
import { SearchDialog } from '../features/search/components/search-dialog.tsx';
import { TicketDialog } from '../features/tickets/components/ticket-dialog.tsx';
import { usePlatform } from '../platform.tsx';
import { useConnectionStore } from '../stores/connection-store.ts';
import { focusMainContent, mainContentId } from './main-content.ts';
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
        <FloatingNotices />
        <Outlet />
      </main>
      <SearchDialog />
      {/* One for every page, so it stays open after ⌘K closes (spec 022). */}
      <TicketDialog />
      {/* New notifications pop up in the corner on every page (spec 029). */}
      <PopUps />
    </div>
  );
}

/**
 * Notices that stay until they're dealt with float just under the page bar, over the page, so the page never moves
 * down for them (the user's call, 20 Oct 2026): Orynx restarted, and on Home a session waiting on you.
 */
function FloatingNotices() {
  const home = useRouterState({ select: (state) => state.location.pathname === '/' });
  return (
    // Sticky at no height, so it takes no room; 56 px down clears the page bar, wherever the page starts.
    <div className="pointer-events-none sticky top-2 z-20 h-0 translate-y-14">
      <div className="flex flex-col items-center gap-2 px-4">
        <StaleNotice />
        {home ? <WaitingBanner /> : null}
      </div>
    </div>
  );
}

/** Shown when the server answered 401: it restarted, so this page holds an old token. */
function StaleNotice() {
  const stale = useConnectionStore((state) => state.stale);
  const platform = usePlatform();
  if (!stale) return null;

  return (
    <Toast
      icon={Alert02Icon}
      tone="warning"
      role="alert"
      title="Orynx restarted"
      detail="Reload the page to reconnect."
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
    />
  );
}
