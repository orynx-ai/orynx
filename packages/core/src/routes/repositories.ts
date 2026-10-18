import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AddRepositoryRequestSchema,
  ApiErrorSchema,
  apiPaths,
  RepositoryIdSchema,
  RepositoryListSchema,
  RepositorySchema,
  UpdateRepositoryRequestSchema,
} from '@devhub/contracts';
import type { RepositoryService } from '../repositories/repository-service.ts';

/** Settings › Repositories (spec 005; Edit from spec 020). A refused folder is a FolderRejectedError, which the /api error handler answers. */
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

  app.patch(
    apiPaths.repository,
    {
      schema: {
        params: z.object({ id: RepositoryIdSchema }),
        body: UpdateRepositoryRequestSchema,
        response: { 200: RepositorySchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const edited = await repositories.update(request.params.id, request.body);
      return edited ?? reply.code(404).send({ code: 'not_found', message: 'This folder is no longer in the list.' });
    },
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
