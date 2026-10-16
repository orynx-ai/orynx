import type { Platform } from '@devhub/app';

export const webPlatform: Platform = {
  kind: 'web',
  openExternal(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  },
  reload() {
    window.location.reload();
  },
};
