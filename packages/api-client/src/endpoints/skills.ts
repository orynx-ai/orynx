import type { AxiosInstance } from 'axios';
import { apiRoutes, SkillListSchema, type SkillList } from '@devhub/contracts';

/** The composer's skills (spec 022): the shown folder's, then yours; yours alone without a folder. */
export async function getSkills(http: AxiosInstance, repositoryId: string | null): Promise<SkillList> {
  const res = await http.get<unknown>(apiRoutes.skills, {
    params: repositoryId === null ? {} : { repositoryId },
  });
  return SkillListSchema.parse(res.data);
}
