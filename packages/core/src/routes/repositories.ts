import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AddRepositoryRequestSchema,
  apiPaths,
  RepositoryIdSchema,
  RepositoryListSchema,
  RepositorySchema,
} from '@devhub/contracts';
import type { RepositoryService } from '../repositories/repository-service.ts';

/** Settings › Repositories (spec 005). A refused folder is a FolderRejectedError, which the /api error handler answers. */
export const repositoriesRoutes: FastifyPluginCallbackZod<{ repositories: RepositoryService }> = (
  app,
  { repositories },
  done,
) => {
  app.get(apiPaths.repositories, { schema: { response: { 200: RepositoryListSchema } } }, async () => ({
    repositories: await repositories.list(),
  }));

  app.post(
    apiPaths.repositories,
    { schema: { body: AddRepositoryRequestSchema, response: { 201: RepositorySchema } } },
    async (request, reply) => reply.code(201).send(await repositories.add(request.body)),
  );

  app.delete(
    apiPaths.repository,
    { schema: { params: z.object({ id: RepositoryIdSchema }), response: { 204: z.undefined() } } },
    async (request, reply) => {
      await repositories.remove(request.params.id);
      return reply.code(204).send();
    },
  );

  done();
};
