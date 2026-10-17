import type { AxiosInstance } from 'axios';
import { apiRoutes, PreferencesSchema, type Preferences, type PreferencesChange } from '@devhub/contracts';

export async function getPreferences(http: AxiosInstance): Promise<Preferences> {
  const res = await http.get<unknown>(apiRoutes.preferences);
  return PreferencesSchema.parse(res.data);
}

/** Saves one change; the answer holds every preference. */
export async function patchPreferences(http: AxiosInstance, change: PreferencesChange): Promise<Preferences> {
  const res = await http.patch<unknown>(apiRoutes.preferences, change);
  return PreferencesSchema.parse(res.data);
}
