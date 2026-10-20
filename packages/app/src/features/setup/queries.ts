import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, setupQueryOptions, type ApiRequestError } from '@devhub/api-client';
import type { SetupRequest, SetupState } from '@devhub/contracts';
import { useApi } from '../../api.tsx';

/** Whether Orynx has its password yet (spec 043). */
export function useSetup() {
  return useQuery(setupQueryOptions(useApi()));
}

/** Finish setup: the answer opens the app, and the profile sent is the one the sidebar shows. */
export function useCompleteSetup() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<SetupState, ApiRequestError, SetupRequest>({
    mutationFn: (request) => api.completeSetup(request),
    // It holds the password: never keep it in the cache after the page is done with it.
    gcTime: 0,
    onSuccess: (state, request) => {
      queryClient.setQueryData(queryKeys.profile, request.profile);
      queryClient.setQueryData(queryKeys.setup, state);
    },
    onError: (error) => {
      // Set up already, from another tab: open the app with the profile that one saved.
      if (error.code !== 'already_set_up') return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      queryClient.setQueryData(queryKeys.setup, { done: true });
    },
  });
}
