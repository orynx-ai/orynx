import type { Platform } from '@devhub/app';

/** The parts of `navigator` that say which system the browser runs on. */
export interface NavigatorPlatform {
  platform: string;
  userAgentData?: { platform: string } | undefined;
}

/** Mac and iPad keyboards use ⌘; everything else uses Ctrl. */
export function detectOs(nav: NavigatorPlatform): Platform['os'] {
  const name = nav.userAgentData?.platform ?? nav.platform;
  return /mac|iphone|ipad/i.test(name) ? 'mac' : 'other';
}

export const webPlatform: Platform = {
  kind: 'web',
  os: detectOs(navigator),
  openExternal(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  },
  reload() {
    window.location.reload();
  },
};
