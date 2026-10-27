import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { alreadyRunningDialog, stoppedDialog } from './dialogs.ts';

const home = join(homedir(), '.devhub');

/** The buttons as they read on screen, left to right: macOS lays them out from the right. */
function onScreen(platform: NodeJS.Platform, dialog: { buttons: string[] }): string[] {
  return platform === 'darwin' ? [...dialog.buttons].reverse() : dialog.buttons;
}

describe('dialogs', () => {
  it('AC-8: another Orynx on this home names the folder as ~ and offers Quit', () => {
    expect(alreadyRunningDialog(home)).toMatchObject({
      message: 'Orynx is already running',
      detail: 'Another Orynx is using ~/.devhub, such as pnpm start in a terminal. Stop it, then open Orynx again.',
      buttons: ['Quit'],
    });
    expect(alreadyRunningDialog('/tmp/devhub-test').detail).toContain('using /tmp/devhub-test,');
  });

  it('AC-9: a stopped hub names the log, with Quit first and Open again last on screen', () => {
    for (const platform of ['darwin', 'linux'] as const) {
      const dialog = stoppedDialog(home, platform);

      expect(dialog).toMatchObject({
        message: 'Orynx stopped',
        detail: 'Its server stopped. The log is in ~/.devhub/logs/orynx.log.',
      });
      expect(onScreen(platform, dialog)).toEqual(['Quit', 'Open again']);
      expect(dialog.buttons[dialog.defaultId]).toBe('Open again');
      expect(dialog.buttons[dialog.cancelId]).toBe('Quit');
    }
  });
});
