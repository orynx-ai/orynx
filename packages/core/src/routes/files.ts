import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import {
  ApiErrorSchema,
  apiPaths,
  FileCheckAnswerSchema,
  FileCheckRequestSchema,
  FilePathSchema,
  FilePicksSchema,
} from '@devhub/contracts';
import { readableFile } from '../files/file-paths.ts';
import type { FilePicker } from '../folder-picker/folder-picker.ts';
import { displayPath } from '../repositories/folder-check.ts';

/**
 * Files from this computer (spec 022, B): the computer's own file picker, and the check of a path typed when no
 * picker can open. Both answer paths with `~`, and neither reads a file.
 */
export const filesRoutes: FastifyPluginCallbackZod<{ picker: FilePicker; home: string }> = (
  app,
  { picker, home },
  done,
) => {
  app.post(
    apiPaths.filePicker,
    { schema: { response: { 200: FilePicksSchema, 503: ApiErrorSchema } } },
    async (_request, reply) => {
      const outcome = await picker.pick();
      switch (outcome.kind) {
        case 'picked': {
          // A path the composer can't hold, such as one with a line break in a name, is left out.
          const paths = outcome.paths
            .map((path) => displayPath(path, home))
            .filter((path) => FilePathSchema.safeParse(path).success);
          return { paths: paths.length === 0 ? null : paths };
        }
        case 'cancelled':
          return { paths: null };
        case 'unavailable':
          return reply.code(503).send({
            code: 'picker_unavailable',
            message: "Orynx can't open a file picker on this computer. Type the file's path instead.",
          });
      }
    },
  );

  app.post(
    apiPaths.fileCheck,
    { schema: { body: FileCheckRequestSchema, response: { 200: FileCheckAnswerSchema } } },
    async (request) => {
      const found = await readableFile(request.body.path, home);
      return found === null
        ? { result: 'not_found' as const }
        : { result: 'found' as const, path: displayPath(found, home) };
    },
  );

  done();
};
