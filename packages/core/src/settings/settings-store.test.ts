import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFileSettingsStore, createMemorySettingsStore, settingsFilePath } from './settings-store.ts';

const jira = { site: 'your-team.atlassian.net', email: 'dev@example.com' };
let home: string;

beforeEach(async () => {
  home = join(await mkdtemp(join(tmpdir(), 'devhub-settings-')), 'home');
});

afterEach(async () => {
  await rm(join(home, '..'), { recursive: true, force: true });
});

describe('file settings store', () => {
  it('starts empty when DevHub has saved nothing yet', async () => {
    expect(await createFileSettingsStore(home).read()).toEqual({});
  });

  it('AC-3: keeps the Jira site and email in settings.json, readable only by this user', async () => {
    const store = createFileSettingsStore(home);

    await store.update((settings) => ({ ...settings, jira }));

    expect(JSON.parse(await readFile(settingsFilePath(home), 'utf8'))).toEqual({ jira });
    expect((await stat(settingsFilePath(home))).mode & 0o777).toBe(0o600);
    expect((await stat(home)).mode & 0o777).toBe(0o700);
    expect(await createFileSettingsStore(home).read()).toEqual({ jira });
  });

  it('AC-3, AC-5: keeps the way GitHub was connected next to Jira, and never a token', async () => {
    const store = createFileSettingsStore(home);

    await store.update((settings) => ({ ...settings, jira }));
    await store.update((settings) => ({ ...settings, github: { method: 'gh' } }));

    expect(JSON.parse(await readFile(settingsFilePath(home), 'utf8'))).toEqual({ jira, github: { method: 'gh' } });
    await expect(store.update((settings) => ({ ...settings, github: { method: 'oauth' } as never }))).rejects.toThrow();
  });

  it('writes through a temporary file and leaves none behind', async () => {
    const store = createFileSettingsStore(home);

    await store.update(() => ({ jira }));
    await store.update(() => ({}));

    expect(await readdir(home)).toEqual(['settings.json']);
  });

  it('runs changes one at a time, each on top of the one before', async () => {
    const store = createFileSettingsStore(home);

    await Promise.all([
      store.update((settings) => ({ ...settings, jira })),
      store.update((settings) => ({ ...settings, jira: { ...jira, email: 'other@example.com' } })),
      store.update(({ jira: _, ...rest }) => rest),
    ]);

    expect(await store.read()).toEqual({});
  });

  it('keeps settings it does not know, so a newer DevHub loses nothing', async () => {
    await mkdir(home, { recursive: true });
    await writeFile(settingsFilePath(home), JSON.stringify({ appearance: { theme: 'dark' } }));
    const store = createFileSettingsStore(home);

    await store.update((settings) => ({ ...settings, jira }));

    expect(JSON.parse(await readFile(settingsFilePath(home), 'utf8'))).toEqual({
      appearance: { theme: 'dark' },
      jira,
    });
  });

  it('treats a broken file as empty, says so, and replaces it on the next save', async () => {
    await mkdir(home, { recursive: true });
    await writeFile(settingsFilePath(home), '{ "jira": ');
    const onUnreadable = vi.fn();
    const store = createFileSettingsStore(home, { onUnreadable });

    expect(await store.read()).toEqual({});
    expect(onUnreadable).toHaveBeenCalledOnce();

    await store.update((settings) => ({ ...settings, jira }));
    expect(await store.read()).toEqual({ jira });
  });

  it('treats a file with a wrong shape as empty', async () => {
    await mkdir(home, { recursive: true });
    await writeFile(settingsFilePath(home), JSON.stringify({ jira: { site: 'jira.example.com' } }));

    expect(await createFileSettingsStore(home).read()).toEqual({});
  });

  it('a failed change leaves the file as it was and later changes still run', async () => {
    const store = createFileSettingsStore(home);
    await store.update(() => ({ jira }));

    await expect(
      store.update(() => {
        throw new Error('change failed');
      }),
    ).rejects.toThrow('change failed');
    await store.update((settings) => ({ ...settings, jira: { ...jira, email: 'new@example.com' } }));

    expect(await store.read()).toEqual({ jira: { ...jira, email: 'new@example.com' } });
  });
});

describe('memory settings store', () => {
  it('keeps settings for this run only, for tests and hosts with no folder', async () => {
    const store = createMemorySettingsStore({ jira });

    await store.update(({ jira: _, ...rest }) => rest);

    expect(await store.read()).toEqual({});
  });
});
