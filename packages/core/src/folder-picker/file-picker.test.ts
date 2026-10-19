import { describe, expect, it } from 'vitest';
import { useFakePickerFolder } from '../test/fake-picker.ts';
import { createFilePicker } from './folder-picker.ts';

const fakePicker = useFakePickerFolder();

describe('file picker (spec 022)', () => {
  it('AC-9: on macOS, opens choose file with several allowed, through JavaScript for Automation, and answers each path', async () => {
    const folder = await fakePicker();
    await folder.install(['osascript'], {
      kind: 'picks',
      stdout: '["/Users/dev/notes/plan.pdf","/Users/dev/Movies/demo.mov"]\n',
    });

    const outcome = await createFilePicker({ searchPath: folder.dir, platform: 'darwin' }).pick();

    expect(outcome).toEqual({ kind: 'picked', paths: ['/Users/dev/notes/plan.pdf', '/Users/dev/Movies/demo.mov'] });
    const [run] = await folder.runs();
    expect(run).toMatch(/^osascript -l JavaScript -e /);
    expect(run).toContain('multipleSelectionsAllowed: true');
  });

  it('AC-9: a file whose name holds a line break stays one file, since macOS answers in JSON', async () => {
    const folder = await fakePicker();
    await folder.install(['osascript'], { kind: 'picks', stdout: '["/Users/dev/odd\\n/etc/passwd"]' });

    expect(await createFilePicker({ searchPath: folder.dir, platform: 'darwin' }).pick()).toEqual({
      kind: 'picked',
      paths: ['/Users/dev/odd\n/etc/passwd'],
    });
  });

  it('AC-11: Cancel is a cancel, and another failure means no picker can open', async () => {
    const cancels = await fakePicker();
    await cancels.install(['osascript'], { kind: 'fails', exitCode: 1, stderr: 'Error: User canceled. (-128)' });
    expect(await createFilePicker({ searchPath: cancels.dir, platform: 'darwin' }).pick()).toEqual({
      kind: 'cancelled',
    });

    const fails = await fakePicker();
    await fails.install(['osascript'], { kind: 'fails', exitCode: 1, stderr: 'No user interaction allowed. (-1713)' });
    expect(await createFilePicker({ searchPath: fails.dir, platform: 'darwin' }).pick()).toEqual({
      kind: 'unavailable',
    });
  });

  it('AC-9: on Linux, tries zenity then kdialog, each letting you pick several files, one path a line', async () => {
    const zenity = await fakePicker();
    await zenity.install(['zenity', 'kdialog'], { kind: 'picks', stdout: '/home/dev/a.log\n/home/dev/b.png\n' });
    expect(await createFilePicker({ searchPath: zenity.dir, platform: 'linux' }).pick()).toEqual({
      kind: 'picked',
      paths: ['/home/dev/a.log', '/home/dev/b.png'],
    });
    // The separator is a line break, so the run log, one run a line, ends the run's line there.
    expect(await zenity.runs()).toEqual(['zenity --file-selection --multiple --separator=']);

    const kdialog = await fakePicker();
    await kdialog.install(['kdialog'], { kind: 'picks', stdout: '/home/dev/a.log\n' });
    expect(await createFilePicker({ searchPath: kdialog.dir, platform: 'linux' }).pick()).toEqual({
      kind: 'picked',
      paths: ['/home/dev/a.log'],
    });
    expect(await kdialog.runs()).toEqual(['kdialog --getopenfilename --multiple --separate-output']);
  });

  it('AC-12: an answer that isn’t only absolute paths means the picker failed, so no other file is taken', async () => {
    for (const [platform, stdout] of [
      ['darwin', 'not json'],
      ['darwin', '["notes/plan.pdf"]'],
      ['darwin', '[]'],
      ['linux', '/home/dev/odd\nname.txt\n'],
    ] as const) {
      const folder = await fakePicker();
      await folder.install(['osascript', 'zenity'], { kind: 'picks', stdout });
      expect(await createFilePicker({ searchPath: folder.dir, platform }).pick()).toEqual({ kind: 'unavailable' });
    }
  });

  it('AC-12: with no picker installed, no picker can open and nothing runs', async () => {
    expect(await createFilePicker({ searchPath: '', platform: 'darwin' }).pick()).toEqual({ kind: 'unavailable' });
    expect(await createFilePicker({ searchPath: '', platform: 'win32' }).pick()).toEqual({ kind: 'unavailable' });
  });
});
