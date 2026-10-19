import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  ReadySkillSchema,
  OrynxSkillListSchema,
  type ReadySkill,
  type SaveSkillRequest,
  type SkillFolder,
  type OrynxSkillList,
} from '@devhub/contracts';

function skillUrl(folder: SkillFolder): string {
  return apiRoutes.orynxSkill.replace(':folder', encodeURIComponent(folder));
}

export async function getOrynxSkills(http: AxiosInstance): Promise<OrynxSkillList> {
  const res = await http.get<unknown>(apiRoutes.orynxSkills);
  return OrynxSkillListSchema.parse(res.data);
}

export async function postOrynxSkill(http: AxiosInstance, request: SaveSkillRequest): Promise<ReadySkill> {
  const res = await http.post<unknown>(apiRoutes.orynxSkills, request);
  return ReadySkillSchema.parse(res.data);
}

/** Saves a skill; the answer's folder is the one its Name makes, so a rename comes back under the new folder. */
export async function putOrynxSkill(
  http: AxiosInstance,
  folder: SkillFolder,
  request: SaveSkillRequest,
): Promise<ReadySkill> {
  const res = await http.put<unknown>(skillUrl(folder), request);
  return ReadySkillSchema.parse(res.data);
}

export async function deleteOrynxSkill(http: AxiosInstance, folder: SkillFolder): Promise<void> {
  await http.delete(skillUrl(folder));
}

export async function postStarterSkills(http: AxiosInstance): Promise<void> {
  await http.post(apiRoutes.orynxSkillStarters);
}
