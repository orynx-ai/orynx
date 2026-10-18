import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { ApiErrorSchema, apiPaths, FolderPickSchema } from '@devhub/contracts';
import type { FolderPicker } from '../folder-picker/folder-picker.ts';
import { displayPath } from '../repositories/folder-check.ts';

/**
 * Choose folder (spec 020): opens the computer's folder picker and answers the path picked, with `~`, or
 * 503 picker_unavailable when no picker can open here. It changes nothing; saving the folder does.
 */
export const folderPickerRoutes: FastifyPluginCallbackZod<{ picker: FolderPicker; home: string }> = (
  app,
  { picker, home },
  done,
) => {
  app.post(
    apiPaths.folderPicker,
    { schema: { response: { 200: FolderPickSchema, 503: ApiErrorSchema } } },
    async (_request, reply) => {
      const outcome = await picker.pick();
      switch (outcome.kind) {
        case 'picked':
          return { path: displayPath(outcome.path, home) };
        case 'cancelled':
          return { path: null };
        case 'unavailable':
          return reply.code(503).send({
            code: 'picker_unavailable',
            message: "Orynx can't open a folder picker on this computer. Type the folder's path instead.",
          });
      }
    },
  );

  done();
};
