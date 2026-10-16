import { describe, expect, it, vi } from 'vitest';
import { webPlatform } from './platform.ts';

describe('webPlatform', () => {
  it('opens outside links in a new tab without giving them access to DevHub', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    webPlatform.openExternal('https://github.com/masterghost2002/dev-hub');

    expect(open).toHaveBeenCalledWith('https://github.com/masterghost2002/dev-hub', '_blank', 'noopener,noreferrer');
  });
});
