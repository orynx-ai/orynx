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
import { checkFolder, displayPath, folderIdentity, stillRepository, type FolderProblem } from './folder-check.ts';

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
  /**
   * Changes a folder's path or Jira project in place, with the checks `add` makes (spec 020). Null when no
   * folder has this id, as when another tab removed it first.
   */
  update(id: RepositoryId, request: z.output<typeof AddRepositoryRequestSchema>): Promise<Repository | null>;
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
      return "Orynx can't read this folder.";
    case 'not_repository':
      return "This folder isn't a git repository. Claude works on a branch, so it needs one.";
    case 'inside_repository':
      return `This folder is inside the repository at ${displayPath(problem.top, home)}. Add that folder instead.`;
    case 'inside_devhub':
      return "This folder is inside Orynx's own folder.";
  }
}

/**
 * Spec 020, Q3: the same folder may be listed again for another Jira project (a repository that serves two
 * projects), never twice for the same one. `sameFolder` holds the ids saved under another spelling of it.
 */
function refuseTwice(
  saved: readonly SavedRepository[],
  sameFolder: ReadonlySet<string>,
  folder: SavedRepository,
): void {
  const twice = saved.some(
    (other) =>
      other.id !== folder.id &&
      (other.path === folder.path || sameFolder.has(other.id)) &&
      other.jiraProject === folder.jiraProject,
  );
  if (!twice) return;
  throw new FolderRejectedError(
    folder.jiraProject === null
      ? 'This folder is already in the list.'
      : `This folder is already in the list for ${folder.jiraProject}.`,
  );
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
      found: await stillRepository(folder.path),
    };
  }

  /** The folder as checked on disk, or a refusal with the message for the Folder field. */
  async function checked({ path, jiraProject }: z.output<typeof AddRepositoryRequestSchema>) {
    const check = await checkFolder(path, { home: options.home, devhubHome });
    if (!check.ok) throw new FolderRejectedError(describe(check.problem, await home()));
    return { path: check.path, jiraProject, identity: check.identity };
  }

  /**
   * The ids of the saved folders that are this folder on disk, leaving out `except` (the one being edited).
   * The same folder may be saved under another spelling of its path, so identities on disk are compared.
   */
  async function sameFolders(identity: string, except: RepositoryId | null): Promise<ReadonlySet<string>> {
    const before = readable((await settings.read()).repositories).filter((other) => other.id !== except);
    const identities = await Promise.all(before.map((other) => folderIdentity(other.path)));
    return new Set(before.filter((_, index) => identities[index] === identity).map((other) => other.id));
  }

  return {
    async list() {
      return Promise.all(readable((await settings.read()).repositories).map(shown));
    },

    async add(request) {
      const { identity, ...saved } = await checked(request);
      const folder: SavedRepository = { id: randomBytes(8).toString('hex'), ...saved };
      const others = await sameFolders(identity, null);
      // Inside the change, so two tabs adding the same folder at once can't both win.
      await settings.update((current) => {
        const written = current.repositories ?? [];
        refuseTwice(readable(written), others, folder);
        // Only the folders this version can show count, so the limit never asks to remove one nobody sees.
        if (readable(written).length >= maxRepositories) {
          throw new FolderRejectedError(`Orynx holds at most ${String(maxRepositories)} folders. Remove one first.`);
        }
        return { ...current, repositories: [...written, folder] };
      });
      events.publish({ type: 'settings.changed' });
      return shown(folder);
    },

    async update(id, request) {
      const { identity, ...saved } = await checked(request);
      const folder: SavedRepository = { id, ...saved };
      const others = await sameFolders(identity, id);
      const outcome = { found: false };
      await settings.update((current) => {
        const written = current.repositories ?? [];
        outcome.found = readable(written).some((other) => other.id === id);
        if (!outcome.found) return current;
        refuseTwice(readable(written), others, folder);
        // In its place, so the list keeps the order the folders were added in.
        return {
          ...current,
          repositories: written.map((item) => (SavedRepositorySchema.safeParse(item).data?.id === id ? folder : item)),
        };
      });
      if (!outcome.found) return null;
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
