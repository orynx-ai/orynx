import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  ProfileSchema,
  SetupStateSchema,
  type Profile,
  type SetupRequest,
  type SetupState,
} from '@devhub/contracts';

export async function getSetup(http: AxiosInstance): Promise<SetupState> {
  const res = await http.get<unknown>(apiRoutes.setup);
  return SetupStateSchema.parse(res.data);
}

/** Once only: a second setup answers 409 `already_set_up`. */
export async function postSetup(http: AxiosInstance, request: SetupRequest): Promise<SetupState> {
  const res = await http.post<unknown>(apiRoutes.setup, request);
  return SetupStateSchema.parse(res.data);
}

export async function getProfile(http: AxiosInstance): Promise<Profile> {
  const res = await http.get<unknown>(apiRoutes.profile);
  return ProfileSchema.parse(res.data);
}

export async function putProfile(http: AxiosInstance, profile: Profile): Promise<Profile> {
  const res = await http.put<unknown>(apiRoutes.profile, profile);
  return ProfileSchema.parse(res.data);
}
