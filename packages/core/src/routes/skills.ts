import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { ApiErrorSchema, apiPaths, SkillListQuerySchema, SkillListSchema } from '@devhub/contracts';
import type { SkillsService } from '../skills/skills-service.ts';

/** The composer's `/` list (spec 022, G): the shown folder's skills, then yours. Reads files; writes nothing. */
export const skillsRoutes: FastifyPluginCallbackZod<{ skills: SkillsService }> = (app, { skills }, done) => {
  app.get(
    apiPaths.skills,
    { schema: { querystring: SkillListQuerySchema, response: { 200: SkillListSchema, 404: ApiErrorSchema } } },
    async (request, reply) => {
      const list = await skills.list(request.query.repositoryId);
      if (list === null) {
        return reply.code(404).send({ code: 'not_found', message: 'Settings › Repositories has no such folder.' });
      }
      return list;
    },
  );
  done();
};
