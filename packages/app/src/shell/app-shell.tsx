import { Outlet } from '@tanstack/react-router';
import { Button, Callout } from '@devhub/ui';
import { usePlatform } from '../platform.tsx';
import { useConnectionStore } from '../stores/connection-store.ts';
import { Sidebar } from './sidebar.tsx';

/** Every screen: skip link, sidebar, then the page. Narrow windows stack the sidebar on top. */
export function AppShell() {
  return (
    <div className="relative flex min-h-dvh flex-col bg-canvas text-foreground md:flex-row">
      <a
        href="#main"
        className="absolute -top-15 left-2 z-30 rounded-sm bg-primary px-3 py-2 font-medium text-primary-foreground no-underline focus:top-2"
      >
        Skip to content
      </a>
      <Sidebar />
      <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col bg-canvas outline-none">
        <StaleBanner />
        <Outlet />
      </main>
    </div>
  );
}

/** Shown when the server answered 401: it restarted, so this page holds an old token. */
function StaleBanner() {
  const stale = useConnectionStore((state) => state.stale);
  const platform = usePlatform();
  if (!stale) return null;

  return (
    <div className="px-6 pt-4">
      <Callout
        tone="warning"
        role="alert"
        title="DevHub restarted"
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
