import { defaultProfile, ProfileSchema, type Profile, type SetupRequest } from '@devhub/contracts';
import { oneAtATime, type SettingsStore } from '../settings/settings-store.ts';
import type { PasswordStore } from './password-store.ts';

/** Set up Orynx and Edit profile (spec 043): the profile in settings.json, and the password beside it. */
export interface SetupService {
  done(): Promise<boolean>;
  /** Saves the profile, then the password. `already_set_up` once a password is saved, and nothing changes. */
  complete(request: SetupRequest): Promise<'done' | 'already_set_up'>;
  profile(): Promise<Profile>;
  saveProfile(profile: Profile): Promise<Profile>;
}

export function createSetupService({
  settings,
  password,
}: {
  settings: SettingsStore;
  password: PasswordStore;
}): SetupService {
  // Two setups at once must not both see "no password" and both save one.
  const queue = oneAtATime();
  const profile = async (): Promise<Profile> => {
    const saved = ProfileSchema.safeParse((await settings.read()).profile);
    return saved.success ? saved.data : defaultProfile;
  };
  const saveProfile = async (next: Profile): Promise<Profile> => {
    await settings.update((current) => ({ ...current, profile: next }));
    return next;
  };

  return {
    done: () => password.isSet(),
    complete: (request) =>
      queue(async () => {
        if (await password.isSet()) return 'already_set_up';
        await saveProfile(request.profile);
        await password.set(request.password);
        return 'done';
      }),
    profile,
    saveProfile,
  };
}
