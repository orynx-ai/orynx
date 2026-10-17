import { describe, expect, it, vi } from 'vitest';
import { detectOs, webPlatform } from './platform.ts';

describe('webPlatform', () => {
  it('opens outside links in a new tab without giving them access to DevHub', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    webPlatform.openExternal('https://github.com/masterghost2002/dev-hub');

    expect(open).toHaveBeenCalledWith('https://github.com/masterghost2002/dev-hub', '_blank', 'noopener,noreferrer');
  });

  it('AC-6: knows a Mac, so the sidebar shows ⌘ keys', () => {
    expect(detectOs({ userAgentData: { platform: 'macOS' }, platform: '' })).toBe('mac');
    expect(detectOs({ platform: 'MacIntel' })).toBe('mac');
    expect(detectOs({ platform: 'iPad' })).toBe('mac');
  });

  it('AC-6: treats Windows and Linux as other, so the sidebar shows Ctrl keys', () => {
    expect(detectOs({ userAgentData: { platform: 'Windows' }, platform: 'Win32' })).toBe('other');
    expect(detectOs({ platform: 'Linux x86_64' })).toBe('other');
  });
});
