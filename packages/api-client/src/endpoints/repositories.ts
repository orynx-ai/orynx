import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  RepositoryListSchema,
  RepositorySchema,
  type AddRepositoryRequest,
  type Repository,
  type RepositoryId,
  type RepositoryList,
} from '@devhub/contracts';

export async function getRepositories(http: AxiosInstance): Promise<RepositoryList> {
  const res = await http.get<unknown>(apiRoutes.repositories);
  return RepositoryListSchema.parse(res.data);
}

/** The server checks the folder on disk before it saves anything. */
export async function postRepository(http: AxiosInstance, request: AddRepositoryRequest): Promise<Repository> {
  const res = await http.post<unknown>(apiRoutes.repositories, request);
  return RepositorySchema.parse(res.data);
}

export async function deleteRepository(http: AxiosInstance, id: RepositoryId): Promise<void> {
  await http.delete(apiRoutes.repository.replace(':id', encodeURIComponent(id)));
}
