import type { AxiosInstance } from 'axios';
import { apiRoutes, StorageSchema, type Storage } from '@devhub/contracts';

export async function getStorage(http: AxiosInstance): Promise<Storage> {
  const res = await http.get<unknown>(apiRoutes.storage);
  return StorageSchema.parse(res.data);
}
