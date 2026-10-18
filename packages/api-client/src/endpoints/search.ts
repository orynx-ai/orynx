import type { AxiosInstance } from 'axios';
import { apiRoutes, SearchIndexSchema, type SearchIndex } from '@devhub/contracts';

export async function getSearch(http: AxiosInstance): Promise<SearchIndex> {
  const res = await http.get<unknown>(apiRoutes.search);
  return SearchIndexSchema.parse(res.data);
}
