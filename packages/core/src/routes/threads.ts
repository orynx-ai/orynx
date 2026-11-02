import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import {
  apiPaths,
  ThreadPreviewAnswerSchema,
  ThreadPreviewQuerySchema,
  type ThreadPreviewAnswer,
} from '@devhub/contracts';

/** A pasted Slack or Discord link's thread, for the composer's chip (spec 016, AC-26). */
export const threadsRoutes: FastifyPluginCallbackZod<{ preview: (link: string) => Promise<ThreadPreviewAnswer> }> = (
  app,
  { preview },
  done,
) => {
  app.get(
    apiPaths.threadPreview,
    { schema: { querystring: ThreadPreviewQuerySchema, response: { 200: ThreadPreviewAnswerSchema } } },
    (request) => preview(request.query.link),
  );
  done();
};
