import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ApiErrorSchema,
  apiPaths,
  ReadySkillSchema,
  SaveSkillRequestSchema,
  SkillFolderSchema,
  SkillListSchema,
} from '@devhub/contracts';
import type { SkillStore } from '../skills/skill-store.ts';

const params = z.object({ folder: SkillFolderSchema });

/**
 * Settings › Skills (spec 023). A folder in a URL passes the same rule as a new Name, so it never leaves the skills
 * folder (AC-20). A Name another skill's folder has is a SkillRejectedError, which the /api error handler answers.
 */
export const skillsRoutes: FastifyPluginCallbackZod<{ skills: SkillStore }> = (app, { skills }, done) => {
  app.get(apiPaths.skills, { schema: { response: { 200: SkillListSchema } } }, () => skills.list());

  app.post(
    apiPaths.skills,
    { schema: { body: SaveSkillRequestSchema, response: { 201: ReadySkillSchema } } },
    async (request, reply) => reply.code(201).send(await skills.add(request.body)),
  );

  app.post(apiPaths.skillStarters, { schema: { response: { 204: z.undefined() } } }, async (_request, reply) => {
    await skills.addStarters();
    return reply.code(204).send();
  });

  app.put(
    apiPaths.skill,
    { schema: { params, body: SaveSkillRequestSchema, response: { 200: ReadySkillSchema, 404: ApiErrorSchema } } },
    async (request, reply) => {
      const saved = await skills.save(request.params.folder, request.body);
      return saved ?? reply.code(404).send({ code: 'not_found', message: 'This skill is no longer in the folder.' });
    },
  );

  app.delete(apiPaths.skill, { schema: { params, response: { 204: z.undefined() } } }, async (request, reply) => {
    await skills.remove(request.params.folder);
    return reply.code(204).send();
  });

  done();
};
