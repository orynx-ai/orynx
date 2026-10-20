import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { profileQueryOptions, queryKeys, type ApiRequestError } from '@devhub/api-client';
import type { Profile } from '@devhub/contracts';
import { useApi } from '../api.tsx';

/** Who uses Orynx, the same on every device (spec 043). */
export function useProfile() {
  return useQuery(profileQueryOptions(useApi()));
}

/** Edit profile's Save: the answer is the saved profile, so the sidebar shows it at once. */
export function useSaveProfile() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<Profile, ApiRequestError, Profile>({
    mutationFn: (profile) => api.saveProfile(profile),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.profile, saved);
    },
  });
}
