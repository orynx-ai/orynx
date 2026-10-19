import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ApiErrorSchema,
  apiPaths,
  ReadySkillSchema,
  SaveSkillRequestSchema,
  SkillFolderSchema,
  OrynxSkillListSchema,
} from '@devhub/contracts';
import type { SkillStore } from '../skills/skill-store.ts';

const params = z.object({ folder: SkillFolderSchema });

/**
 * Settings › Skills (spec 023): your own skills, under /api/skills/orynx; GET /api/skills is the composer's `/` list. A folder in a URL passes the same rule as a new Name, so it never leaves the skills
 * folder (AC-20). A Name another skill's folder has is a SkillRejectedError, which the /api error handler answers.
 */
export const orynxSkillsRoutes: FastifyPluginCallbackZod<{ store: SkillStore }> = (app, { store }, done) => {
  app.get(apiPaths.orynxSkills, { schema: { response: { 200: OrynxSkillListSchema } } }, () => store.list());

  app.post(
    apiPaths.orynxSkills,
    { schema: { body: SaveSkillRequestSchema, response: { 201: ReadySkillSchema } } },
    async (request, reply) => reply.code(201).send(await store.add(request.body)),
  );

  app.post(apiPaths.orynxSkillStarters, { schema: { response: { 204: z.undefined() } } }, async (_request, reply) => {
    await store.addStarters();
    return reply.code(204).send();
  });

  app.put(
    apiPaths.orynxSkill,
    { schema: { params, body: SaveSkillRequestSchema, response: { 200: ReadySkillSchema, 404: ApiErrorSchema } } },
    async (request, reply) => {
      const saved = await store.save(request.params.folder, request.body);
      return saved ?? reply.code(404).send({ code: 'not_found', message: 'This skill is no longer in the folder.' });
    },
  );

  app.delete(apiPaths.orynxSkill, { schema: { params, response: { 204: z.undefined() } } }, async (request, reply) => {
    await store.remove(request.params.folder);
    return reply.code(204).send();
  });

  done();
};
