import { createContext, use, type ReactNode } from 'react';

/**
 * Everything that differs between the browser and a desktop window. Hosts implement it
 * (apps/web today, apps/desktop later); app code calls it instead of checking where it runs.
 */
export interface Platform {
  readonly kind: 'web' | 'desktop';
  /** Decides which keys shortcuts use and show: ⌘ on a Mac, Ctrl elsewhere. */
  readonly os: 'mac' | 'other';
  /** Opens a Jira, GitHub or Slack link outside DevHub. */
  openExternal(url: string): void;
  /** Reloads the app, for example after the server restarted with a new token. */
  reload(): void;
}

const PlatformContext = createContext<Platform | null>(null);

export function PlatformProvider({ platform, children }: { platform: Platform; children: ReactNode }) {
  return <PlatformContext value={platform}>{children}</PlatformContext>;
}

export function usePlatform(): Platform {
  const platform = use(PlatformContext);
  if (platform === null) throw new Error('usePlatform() must be used inside <DevhubApp>.');
  return platform;
}
