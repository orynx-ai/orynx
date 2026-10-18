import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { apiPaths, SearchIndexSchema } from '@devhub/contracts';
import type { SearchService } from '../search/search-service.ts';

/** ⌘K search (spec 009): everything DevHub holds that search can find. Asks neither Jira nor GitHub. */
export const searchRoutes: FastifyPluginCallbackZod<{ search: SearchService }> = (app, { search }, done) => {
  app.get(apiPaths.search, { schema: { response: { 200: SearchIndexSchema } } }, () => search.read());
  done();
};
