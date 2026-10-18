import { describe, expect, it } from 'vitest';
import { useFakePickerFolder } from '../test/fake-picker.ts';
import { createFolderPicker } from './folder-picker.ts';

const fakePicker = useFakePickerFolder();

describe('folder picker (spec 020)', () => {
  it('AC-35: on macOS, opens osascript’s choose folder and answers the path without its trailing slash', async () => {
    const folder = await fakePicker();
    await folder.install(['osascript'], { kind: 'picks', stdout: '/Users/dev/code/intranet-web/\n' });

    const outcome = await createFolderPicker({ searchPath: folder.dir, platform: 'darwin' }).pick();

    expect(outcome).toEqual({ kind: 'picked', path: '/Users/dev/code/intranet-web' });
    expect(await folder.runs()).toEqual(['osascript -e POSIX path of (choose folder)']);
  });

  it('AC-35: Cancel in the macOS picker is a cancel, not a failure', async () => {
    const folder = await fakePicker();
    await folder.install(['osascript'], { kind: 'cancels', stderr: 'execution error: User canceled. (-128)' });

    expect(await createFolderPicker({ searchPath: folder.dir, platform: 'darwin' }).pick()).toEqual({
      kind: 'cancelled',
    });
  });

  it('AC-36: osascript failing for another reason, such as no screen, means no picker can open', async () => {
    const folder = await fakePicker();
    await folder.install(['osascript'], { kind: 'fails', exitCode: 1, stderr: 'No user interaction allowed. (-1713)' });

    expect(await createFolderPicker({ searchPath: folder.dir, platform: 'darwin' }).pick()).toEqual({
      kind: 'unavailable',
    });
  });

  it('AC-35: on Linux, tries zenity first, then kdialog', async () => {
    const zenity = await fakePicker();
    await zenity.install(['zenity', 'kdialog'], { kind: 'picks', stdout: '/home/dev/code/app\n' });
    expect(await createFolderPicker({ searchPath: zenity.dir, platform: 'linux' }).pick()).toEqual({
      kind: 'picked',
      path: '/home/dev/code/app',
    });
    expect(await zenity.runs()).toEqual(['zenity --file-selection --directory']);

    const kdialog = await fakePicker();
    await kdialog.install(['kdialog'], { kind: 'cancels' });
    expect(await createFolderPicker({ searchPath: kdialog.dir, platform: 'linux' }).pick()).toEqual({
      kind: 'cancelled',
    });
    expect(await kdialog.runs()).toEqual(['kdialog --getexistingdirectory']);
  });

  it('AC-36: zenity that can’t open a display says so, which is not a cancel', async () => {
    const folder = await fakePicker();
    await folder.install(['zenity'], { kind: 'cancels', stderr: 'cannot open display:' });

    expect(await createFolderPicker({ searchPath: folder.dir, platform: 'linux' }).pick()).toEqual({
      kind: 'unavailable',
    });
  });

  it('AC-35: on Windows, opens PowerShell’s folder dialog', async () => {
    const folder = await fakePicker();
    await folder.install(['powershell.exe'], { kind: 'picks', stdout: 'C:\\Users\\dev\\code\\app\r\n' });

    const outcome = await createFolderPicker({ searchPath: folder.dir, platform: 'win32' }).pick();

    // A Windows path isn't absolute to the macOS or Linux machine running this test, so the answer depends
    // on where it runs; what matters here is that PowerShell ran with the dialog.
    expect(outcome.kind).toBe(process.platform === 'win32' ? 'picked' : 'unavailable');
    expect((await folder.runs())[0]).toMatch(/^powershell\.exe -NoProfile -STA -Command .*FolderBrowserDialog/);
  });

  it('AC-36: with no picker installed, or on another OS, no picker can open and nothing runs', async () => {
    const folder = await fakePicker();
    await folder.install(['zenity'], { kind: 'picks', stdout: '/home/dev' });

    expect(await createFolderPicker({ searchPath: folder.dir, platform: 'darwin' }).pick()).toEqual({
      kind: 'unavailable',
    });
    expect(await createFolderPicker({ searchPath: folder.dir, platform: 'freebsd' }).pick()).toEqual({
      kind: 'unavailable',
    });
    expect(await createFolderPicker({ searchPath: '', platform: 'linux' }).pick()).toEqual({ kind: 'unavailable' });
    expect(await folder.runs()).toEqual([]);
  });

  it('a second press while the picker is open waits for the same answer, and opens only one', async () => {
    const folder = await fakePicker();
    await folder.install(['osascript'], { kind: 'picks', stdout: '/Users/dev/code/app/' });
    const picker = createFolderPicker({ searchPath: folder.dir, platform: 'darwin' });

    const [first, second] = await Promise.all([picker.pick(), picker.pick()]);

    expect(first).toEqual(second);
    expect(await folder.runs()).toHaveLength(1);
    // Once it has answered, the next press opens it again.
    await picker.pick();
    expect(await folder.runs()).toHaveLength(2);
  });

  it('a picker left open past the limit is closed, and counts as a cancel', async () => {
    const folder = await fakePicker();
    await folder.install(['osascript'], { kind: 'slow' });

    expect(await createFolderPicker({ searchPath: folder.dir, platform: 'darwin', timeoutMs: 200 }).pick()).toEqual({
      kind: 'cancelled',
    });
  });

  it('an answer that is no absolute path means the picker failed', async () => {
    const folder = await fakePicker();
    await folder.install(['osascript'], { kind: 'picks', stdout: 'code/app' });

    expect(await createFolderPicker({ searchPath: folder.dir, platform: 'darwin' }).pick()).toEqual({
      kind: 'unavailable',
    });
  });
});
