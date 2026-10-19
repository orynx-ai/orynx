import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  ReadySkillSchema,
  SkillListSchema,
  type ReadySkill,
  type SaveSkillRequest,
  type SkillFolder,
  type SkillList,
} from '@devhub/contracts';

function skillUrl(folder: SkillFolder): string {
  return apiRoutes.skill.replace(':folder', encodeURIComponent(folder));
}

export async function getSkills(http: AxiosInstance): Promise<SkillList> {
  const res = await http.get<unknown>(apiRoutes.skills);
  return SkillListSchema.parse(res.data);
}

export async function postSkill(http: AxiosInstance, request: SaveSkillRequest): Promise<ReadySkill> {
  const res = await http.post<unknown>(apiRoutes.skills, request);
  return ReadySkillSchema.parse(res.data);
}

/** Saves a skill; the answer's folder is the one its Name makes, so a rename comes back under the new folder. */
export async function putSkill(
  http: AxiosInstance,
  folder: SkillFolder,
  request: SaveSkillRequest,
): Promise<ReadySkill> {
  const res = await http.put<unknown>(skillUrl(folder), request);
  return ReadySkillSchema.parse(res.data);
}

export async function deleteSkill(http: AxiosInstance, folder: SkillFolder): Promise<void> {
  await http.delete(skillUrl(folder));
}

export async function postStarterSkills(http: AxiosInstance): Promise<void> {
  await http.post(apiRoutes.skillStarters);
}
