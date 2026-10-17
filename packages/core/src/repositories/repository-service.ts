import { randomBytes } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  maxRepositories,
  type AddRepositoryRequestSchema,
  type ApiErrorCode,
  type Repository,
  type RepositoryId,
} from '@devhub/contracts';
import type { z } from 'zod';
import type { EventBus } from '../events/event-bus.ts';
import { SavedRepositorySchema, type SavedRepository, type SettingsStore } from '../settings/settings-store.ts';
import { checkFolder, displayPath, folderIdentity, type FolderProblem } from './folder-check.ts';

/** Why a folder wasn't added. The message goes under the Folder field as it is (spec 005, Q8e). */
export class FolderRejectedError extends Error {
  readonly code = 'folder_rejected' satisfies ApiErrorCode;

  constructor(message: string) {
    super(message);
    this.name = 'FolderRejectedError';
  }
}

/** Settings › Repositories (spec 005): the folders Claude may work in. */
export interface RepositoryService {
  list(): Promise<Repository[]>;
  /** Checks the folder on disk, then saves it. A refusal is a {@link FolderRejectedError}. */
  add(request: z.output<typeof AddRepositoryRequestSchema>): Promise<Repository>;
  /** Forgets the folder; nothing on disk changes. A folder already gone is not an error. */
  remove(id: RepositoryId): Promise<void>;
}

export interface RepositoryServiceOptions {
  settings: SettingsStore;
  events: EventBus;
  /** The person's home folder, for `~`. */
  home: string;
  /** DEVHUB_HOME, which can never be added. */
  devhubHome: string;
}

/** The folders this version can read; the others stay in settings.json untouched. */
function readable(written: readonly unknown[] = []): SavedRepository[] {
  return written.flatMap((item) => {
    const folder = SavedRepositorySchema.safeParse(item);
    return folder.success ? [folder.data] : [];
  });
}

function describe(problem: FolderProblem, home: string): string {
  switch (problem.kind) {
    case 'empty':
      return "Enter the folder's path.";
    case 'not_full_path':
      return 'Enter the full path, starting with / or ~.';
    case 'missing':
      return 'Nothing is at this path.';
    case 'file':
      return 'This is a file. Pick its folder.';
    case 'unreadable':
      return "DevHub can't read this folder.";
    case 'not_repository':
      return "This folder isn't a git repository. Claude works on a branch, so it needs one.";
    case 'inside_repository':
      return `This folder is inside the repository at ${displayPath(problem.top, home)}. Add that folder instead.`;
    case 'inside_devhub':
      return "This folder is inside DevHub's own folder.";
  }
}

export function createRepositoryService(options: RepositoryServiceOptions): RepositoryService {
  const { settings, events, devhubHome } = options;
  // The real home folder, so a path under a symlinked home still shows with `~`.
  let realHome: Promise<string> | undefined;
  const home = () => (realHome ??= realpath(options.home).catch(() => options.home));

  async function shown(folder: SavedRepository): Promise<Repository> {
    return {
      id: folder.id,
      path: folder.path,
      name: basename(folder.path),
      displayPath: displayPath(folder.path, await home()),
      jiraProject: folder.jiraProject,
    };
  }

  return {
    async list() {
      return Promise.all(readable((await settings.read()).repositories).map(shown));
    },

    async add({ path, jiraProject }) {
      const check = await checkFolder(path, { home: options.home, devhubHome });
      if (!check.ok) throw new FolderRejectedError(describe(check.problem, await home()));

      const folder: SavedRepository = { id: randomBytes(8).toString('hex'), path: check.path, jiraProject };
      // The same folder may be saved under another spelling of its path, so compare identities on disk.
      const before = readable((await settings.read()).repositories);
      const identities = await Promise.all(before.map((other) => folderIdentity(other.path)));
      const sameFolder = new Set(before.filter((_, index) => identities[index] === check.identity).map((o) => o.id));
      // Inside the change, so two tabs adding the same folder at once can't both win.
      await settings.update((current) => {
        const written = current.repositories ?? [];
        if (readable(written).some((other) => other.path === folder.path || sameFolder.has(other.id))) {
          throw new FolderRejectedError('This folder is already in the list.');
        }
        if (written.length >= maxRepositories) {
          throw new FolderRejectedError(`DevHub holds at most ${String(maxRepositories)} folders. Remove one first.`);
        }
        return { ...current, repositories: [...written, folder] };
      });
      events.publish({ type: 'settings.changed' });
      return shown(folder);
    },

    async remove(id) {
      const outcome = { removed: false };
      await settings.update((current) => {
        const written = current.repositories ?? [];
        const left = written.filter((item) => SavedRepositorySchema.safeParse(item).data?.id !== id);
        outcome.removed = left.length < written.length;
        return outcome.removed ? { ...current, repositories: left } : current;
      });
      if (outcome.removed) events.publish({ type: 'settings.changed' });
    },
  };
}
