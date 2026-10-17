import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { jiraConnectionQueryOptions, queryKeys, statusQueryOptions, type ApiRequestError } from '@devhub/api-client';
import type { JiraConnection, JiraConnectionRequest } from '@devhub/contracts';
import { useApi } from '../../api.tsx';

/** What the hub is connected to. Kept fresh by `status.changed` events, not polling. */
export function useStatus() {
  const api = useApi();
  return useQuery(statusQueryOptions(api));
}

/** The saved Jira site and email, and whether `.env` holds a Jira token. */
export function useJiraConnection() {
  const api = useApi();
  return useQuery(jiraConnectionQueryOptions(api));
}

/** Checks the credentials with Jira, then saves them. Fails with an ApiRequestError whose code says where it belongs. */
export function useConnectJira() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<JiraConnection, ApiRequestError, JiraConnectionRequest>({
    mutationKey: queryKeys.jiraConnection,
    mutationFn: (request) => api.connectJira(request),
    // The request holds the typed token: drop it from the mutation cache as soon as nothing shows it.
    gcTime: 0,
    onSuccess: async (connection) => {
      // The answer is the new value, so the row reads "Manage" at once; the status line refetches.
      queryClient.setQueryData(queryKeys.jiraConnection, connection);
      await queryClient.invalidateQueries({ queryKey: queryKeys.status });
    },
  });
}

/** Removes the Jira token, site and email. */
export function useDisconnectJira() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: queryKeys.jiraConnection,
    mutationFn: () => api.disconnectJira(),
    onSuccess: async () => {
      // Nothing is saved now, so the row reads "Connect" at once; the status line refetches.
      queryClient.setQueryData<JiraConnection>(queryKeys.jiraConnection, (old) => old && { ...old, saved: null });
      await queryClient.invalidateQueries({ queryKey: queryKeys.status });
    },
  });
}

/** Whether Jira is being connected or disconnected right now. */
export function useJiraChangeRunning(): boolean {
  return useIsMutating({ mutationKey: queryKeys.jiraConnection }) > 0;
}
