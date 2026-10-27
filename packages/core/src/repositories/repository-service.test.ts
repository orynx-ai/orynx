import { mkdir, mkdtemp, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../events/event-bus.ts';
import { createMemorySettingsStore, type Settings } from '../settings/settings-store.ts';
import { FolderRejectedError, createRepositoryService } from './repository-service.ts';

let root: string;
let home: string;
let app: string;

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'devhub-repositories-')));
  home = join(root, 'home');
  app = join(home, 'code', 'app');
  await mkdir(join(app, '.git'), { recursive: true });
  await mkdir(join(app, 'src'));
  await mkdir(join(home, 'code', 'mobile', '.git'), { recursive: true });
  await mkdir(join(home, 'plain'));
  await writeFile(join(home, 'notes.txt'), 'not a folder');
  await symlink(app, join(home, 'app-link'));
  await mkdir(join(home, '.devhub', 'worktrees'), { recursive: true });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function service(initial: Settings = {}) {
  const settings = createMemorySettingsStore(initial);
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const repositories = createRepositoryService({ settings, events, home, devhubHome: join(home, '.devhub') });
  return { repositories, settings, seen };
}

async function refusal(work: Promise<unknown>): Promise<string> {
  const error: unknown = await work.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(FolderRejectedError);
  return (error as FolderRejectedError).message;
}

describe('repository service', () => {
  it('AC-4: lists nothing on a fresh DevHub', async () => {
    expect(await service().repositories.list()).toEqual([]);
  });

  it('AC-6: adds a folder with its Jira project, shows it with ~, and says settings changed', async () => {
    const { repositories, settings, seen } = service();

    const added = await repositories.add({ path: '~/code/app', jiraProject: 'PROJ' });

    expect(added).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{16}$/) as unknown,
      path: app,
      name: 'app',
      displayPath: '~/code/app',
      jiraProject: 'PROJ',
      found: true,
    });
    expect((await settings.read()).repositories).toEqual([{ id: added.id, path: app, jiraProject: 'PROJ' }]);
    expect(await repositories.list()).toEqual([added]);
    expect(seen).toEqual([{ type: 'settings.changed' }]);
  });

  it('AC-16 (spec 049): says when a saved folder is gone or no longer a repository, and keeps it saved', async () => {
    const moved = join(home, 'code', 'moved');
    await mkdir(join(moved, '.git'), { recursive: true });
    const { repositories, settings } = service();
    const added = await repositories.add({ path: '~/code/moved', jiraProject: null });
    expect(added.found).toBe(true);

    await rm(moved, { recursive: true });
    expect(await repositories.list()).toMatchObject([{ id: added.id, found: false }]);
    await mkdir(moved);
    expect(await repositories.list()).toMatchObject([{ id: added.id, found: false }]);
    await mkdir(join(moved, '.git'));
    expect(await repositories.list()).toMatchObject([{ id: added.id, found: true }]);
    expect((await settings.read()).repositories).toHaveLength(1);
  });

  it('AC-6: keeps the folders in the order they were added', async () => {
    const { repositories } = service();

    await repositories.add({ path: '~/code/app', jiraProject: null });
    await repositories.add({ path: `${home}/code/mobile`, jiraProject: 'MOB' });

    expect((await repositories.list()).map((folder) => [folder.name, folder.jiraProject])).toEqual([
      ['app', null],
      ['mobile', 'MOB'],
    ]);
  });

  it("AC-7: refuses each folder it can't add with the message for the Folder field, and saves nothing", async () => {
    const { repositories, settings, seen } = service();

    expect(await refusal(repositories.add({ path: '~/missing', jiraProject: null }))).toBe('Nothing is at this path.');
    expect(await refusal(repositories.add({ path: '~/notes.txt', jiraProject: null }))).toBe(
      'This is a file. Pick its folder.',
    );
    expect(await refusal(repositories.add({ path: '~/plain', jiraProject: null }))).toBe(
      "This folder isn't a git repository. Claude works on a branch, so it needs one.",
    );
    expect(await refusal(repositories.add({ path: '~/code/app/src', jiraProject: null }))).toBe(
      'This folder is inside the repository at ~/code/app. Add that folder instead.',
    );
    expect(await refusal(repositories.add({ path: '~/.devhub/worktrees', jiraProject: null }))).toBe(
      "This folder is inside Orynx's own folder.",
    );
    expect(await refusal(repositories.add({ path: `${home}/a\nb`, jiraProject: null }))).toBe(
      'Enter the full path, starting with / or ~.',
    );
    expect((await settings.read()).repositories).toBeUndefined();
    expect(seen).toEqual([]);
  });

  it('AC-7: refuses a folder already in the list for the same project, even through a symlink', async () => {
    const { repositories } = service();
    await repositories.add({ path: '~/code/app', jiraProject: null });
    await repositories.add({ path: '~/code/mobile', jiraProject: 'MOB' });

    expect(await refusal(repositories.add({ path: '~/app-link', jiraProject: null }))).toBe(
      'This folder is already in the list.',
    );
    expect(await refusal(repositories.add({ path: '~/code/mobile', jiraProject: 'MOB' }))).toBe(
      'This folder is already in the list for MOB.',
    );
    expect(await repositories.list()).toHaveLength(2);
  });

  it('AC-21 (spec 020, Q3): lists the same folder again for another Jira project, as Duplicate does', async () => {
    const { repositories } = service();
    await repositories.add({ path: '~/code/app', jiraProject: 'PROJ' });

    const again = await repositories.add({ path: '~/app-link', jiraProject: 'WEB' });

    expect(again).toMatchObject({ path: app, jiraProject: 'WEB' });
    expect((await repositories.list()).map((folder) => [folder.name, folder.jiraProject])).toEqual([
      ['app', 'PROJ'],
      ['app', 'WEB'],
    ]);
  });

  it('AC-7: refuses a folder already in the list under another spelling of its path', async () => {
    // Saved under a second spelling of the same folder, as macOS can reach one through /System/Volumes/Data.
    const { repositories } = service({
      repositories: [{ id: '00000000000000aa', path: join(home, 'app-link'), jiraProject: null }],
    });

    expect(await refusal(repositories.add({ path: '~/code/app', jiraProject: null }))).toBe(
      'This folder is already in the list.',
    );
  });

  it('AC-7: refuses a 101st folder', async () => {
    const full = Array.from({ length: 100 }, (_, index) => ({
      id: index.toString(16).padStart(16, '0'),
      path: `/elsewhere/${String(index)}`,
      jiraProject: null,
    }));
    const { repositories } = service({ repositories: full });

    expect(await refusal(repositories.add({ path: '~/code/app', jiraProject: null }))).toBe(
      'Orynx holds at most 100 folders. Remove one first.',
    );
  });

  it('AC-20 (spec 020): edits a folder in place, keeping its id and place, and says settings changed', async () => {
    const { repositories, settings, seen } = service();
    const first = await repositories.add({ path: '~/code/app', jiraProject: 'PROJ' });
    await repositories.add({ path: '~/code/mobile', jiraProject: 'MOB' });
    seen.length = 0;

    const edited = await repositories.update(first.id, { path: '~/code/app', jiraProject: 'WEB' });

    expect(edited).toEqual({ ...first, jiraProject: 'WEB' });
    expect((await repositories.list()).map((folder) => [folder.id, folder.jiraProject])).toEqual([
      [first.id, 'WEB'],
      [expect.any(String) as unknown, 'MOB'],
    ]);
    expect((await settings.read()).repositories?.[0]).toEqual({ id: first.id, path: app, jiraProject: 'WEB' });
    expect(seen).toEqual([{ type: 'settings.changed' }]);
  });

  it('AC-20 (spec 020): moves a folder to another path, with the checks adding makes', async () => {
    const { repositories } = service();
    const first = await repositories.add({ path: '~/code/app', jiraProject: 'PROJ' });
    await repositories.add({ path: '~/code/mobile', jiraProject: 'MOB' });

    expect(await refusal(repositories.update(first.id, { path: '~/plain', jiraProject: 'PROJ' }))).toBe(
      "This folder isn't a git repository. Claude works on a branch, so it needs one.",
    );
    expect(await refusal(repositories.update(first.id, { path: '~/code/mobile', jiraProject: 'MOB' }))).toBe(
      'This folder is already in the list for MOB.',
    );
    expect(await repositories.update(first.id, { path: '~/code/mobile', jiraProject: 'PROJ' })).toMatchObject({
      id: first.id,
      name: 'mobile',
      jiraProject: 'PROJ',
    });
  });

  it('AC-20 (spec 020): saving a folder unchanged is not a duplicate of itself', async () => {
    const { repositories } = service();
    const first = await repositories.add({ path: '~/code/app', jiraProject: 'PROJ' });

    expect(await repositories.update(first.id, { path: '~/app-link', jiraProject: 'PROJ' })).toMatchObject({
      id: first.id,
      jiraProject: 'PROJ',
    });
  });

  it('AC-20 (spec 020): editing a folder another tab removed answers null and saves nothing', async () => {
    const { repositories, seen } = service();

    expect(await repositories.update('00000000000000aa', { path: '~/code/app', jiraProject: null })).toBeNull();
    expect(await repositories.list()).toEqual([]);
    expect(seen).toEqual([]);
  });

  it('AC-11: removes a folder by id, says settings changed, and leaves the folder on disk', async () => {
    const { repositories, settings, seen } = service();
    const added = await repositories.add({ path: '~/code/app', jiraProject: 'PROJ' });

    await repositories.remove(added.id);

    expect(await repositories.list()).toEqual([]);
    expect((await settings.read()).repositories).toEqual([]);
    expect(seen).toEqual([{ type: 'settings.changed' }, { type: 'settings.changed' }]);
    expect((await stat(join(app, '.git'))).isDirectory()).toBe(true);
  });

  it('AC-11: removing a folder that is already gone changes nothing, as when another tab removed it first', async () => {
    const { repositories, seen } = service();

    await repositories.remove('0123456789abcdef');

    expect(seen).toEqual([]);
  });

  it('lists only the folders it can read, and keeps the others through later saves', async () => {
    const unreadable = { path: 42, from: 'a newer Orynx' };
    const good = { id: '00000000000000aa', path: join(home, 'code', 'mobile'), jiraProject: 'MOB' };
    const { repositories, settings } = service({ repositories: [unreadable, good] });

    expect((await repositories.list()).map((folder) => folder.id)).toEqual([good.id]);
    const added = await repositories.add({ path: '~/code/app', jiraProject: null });
    await repositories.remove(good.id);

    expect((await settings.read()).repositories).toEqual([unreadable, { id: added.id, path: app, jiraProject: null }]);
  });

  it('AC-18: leaves the Jira and GitHub settings as they were', async () => {
    const jira = { site: 'your-team.atlassian.net', email: 'dev@example.com' };
    const { repositories, settings } = service({ jira, github: { method: 'gh' } });

    const added = await repositories.add({ path: '~/code/app', jiraProject: null });
    await repositories.remove(added.id);

    expect(await settings.read()).toMatchObject({ jira, github: { method: 'gh' } });
  });
});
