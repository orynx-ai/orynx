import { z } from 'zod';

/**
 * Files from this computer, by path (spec 022, B). The page never reads a file; it holds the path the computer's
 * own picker gave, absolute or from `~`, and Claude reads the file where it is.
 */

/** A file's path as the composer holds it: from `/` or `~/`, with no control characters, at most 4,096 long. */
export const FilePathSchema = z
  .string()
  .min(2)
  .max(4096)
  .regex(/^(?:\/|~\/)[^\p{Cc}]*$/u);
export type FilePath = z.infer<typeof FilePathSchema>;

/**
 * POST /api/file-picker: the files picked in the computer's own file picker, with `~` for the home folder, or
 * null when the person pressed Cancel (AC-9, AC-11). 503 `picker_unavailable` when no picker can open (AC-12).
 */
export const FilePicksSchema = z.object({ paths: z.array(FilePathSchema).min(1).nullable() });
export type FilePicks = z.infer<typeof FilePicksSchema>;

/** POST /api/files/check: a path typed in Add a file, when no picker can open (AC-12). */
export const FileCheckRequestSchema = z.object({ path: FilePathSchema });
export type FileCheckRequest = z.infer<typeof FileCheckRequestSchema>;

/** The typed path as the server found it, with `~` for the home folder, or that there's no file there to read. */
export const FileCheckAnswerSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('found'), path: FilePathSchema }),
  z.object({ result: z.literal('not_found') }),
]);
export type FileCheckAnswer = z.infer<typeof FileCheckAnswerSchema>;
