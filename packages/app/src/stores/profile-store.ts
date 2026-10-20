import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** What the person set in Edit profile. It stays in this browser: the server never sees it. */
export interface Profile {
  /** Empty: the name the server knows (`git config user.name`) shows instead. */
  name: string;
  bio: string;
  /** A small square picture as a `data:` URL, or null for initials. */
  picture: string | null;
}

interface ProfileState extends Profile {
  setProfile: (profile: Profile) => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      name: '',
      bio: '',
      picture: null,
      setProfile: (profile) => {
        set(profile);
      },
    }),
    { name: 'devhub.profile' },
  ),
);
