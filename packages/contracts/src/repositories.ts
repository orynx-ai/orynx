import { z } from 'zod';
import { JiraProjectKeySchema } from './jira.ts';

/** Settings › Repositories holds at most this many folders (spec 005). */
export const maxRepositories = 100;

/** The random id DevHub gives a folder when it's added, so a path never has to travel in a URL. */
export const RepositoryIdSchema = z.string().regex(/^[0-9a-f]{16}$/);
export type RepositoryId = z.infer<typeof RepositoryIdSchema>;

/** A folder on this computer that Claude may work in, with the Jira project its tickets belong to. */
export const RepositorySchema = z.object({
  id: RepositoryIdSchema,
  /** The real path, with symlinks resolved. */
  path: z.string(),
  /** The folder's own name, for the row. */
  name: z.string(),
  /** The path as the row shows it, with `~` for the home folder. */
  displayPath: z.string(),
  jiraProject: JiraProjectKeySchema.nullable(),
});
export type Repository = z.infer<typeof RepositorySchema>;

/** GET /api/repositories, in the order the folders were added. */
export const RepositoryListSchema = z.object({ repositories: z.array(RepositorySchema) });
export type RepositoryList = z.infer<typeof RepositoryListSchema>;

/**
 * What the Folder field may hold before the server looks at the disk. The form and the server refuse
 * the same values; the server's folder check says the rest (spec 005, Q8e).
 */
export const RepositoryPathSchema = z
  .string()
  .trim()
  .min(1, "Enter the folder's path.")
  .max(4096, 'Enter the full path, starting with / or ~.')
  .refine((path) => path.startsWith('/') || path === '~' || path.startsWith('~/'), {
    message: 'Enter the full path, starting with / or ~.',
  });

/** POST /api/repositories: the folder as typed, and the Jira project picked (or none). */
export const AddRepositoryRequestSchema = z.object({
  path: RepositoryPathSchema,
  jiraProject: JiraProjectKeySchema.nullable(),
});
export type AddRepositoryRequest = z.input<typeof AddRepositoryRequestSchema>;

/**
 * PATCH /api/repositories/:id: the folder's path and Jira project as the Edit dialog holds them (spec 020).
 * The server checks the path as it checks a new folder.
 */
export const UpdateRepositoryRequestSchema = AddRepositoryRequestSchema;
export type UpdateRepositoryRequest = z.input<typeof UpdateRepositoryRequestSchema>;

/**
 * POST /api/folder-picker: the folder picked in the computer's own folder picker, with `~` for the home
 * folder, or null when the person pressed Cancel (spec 020, AC-35). The Folder field takes it as typed text,
 * and the server checks it when the folder is saved.
 */
export const FolderPickSchema = z.object({ path: z.string().min(1).nullable() });
export type FolderPick = z.infer<typeof FolderPickSchema>;
