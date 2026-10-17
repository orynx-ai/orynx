import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  githubConnectionQueryOptions,
  jiraConnectionQueryOptions,
  jiraProjectsQueryOptions,
  preferencesQueryOptions,
  queryKeys,
  repositoriesQueryOptions,
  statusQueryOptions,
  type ApiRequestError,
} from '@devhub/api-client';
import type {
  GitHubConnection,
  GitHubConnectionRequest,
  JiraConnection,
  JiraConnectionRequest,
  Preferences,
  PreferencesChange,
  AddRepositoryRequest,
  Repository,
  RepositoryId,
  RepositoryList,
} from '@devhub/contracts';
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

/** The saved way of connecting GitHub, whether `.env` holds a GitHub token, and whether gh was found. */
export function useGitHubConnection() {
  const api = useApi();
  return useQuery(githubConnectionQueryOptions(api));
}

/** Gets a token the way asked, checks it with GitHub, then saves. Fails with an ApiRequestError whose code says where it belongs. */
export function useConnectGitHub() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<GitHubConnection, ApiRequestError, GitHubConnectionRequest>({
    mutationKey: queryKeys.githubConnection,
    mutationFn: (request) => api.connectGitHub(request),
    // The request may hold the typed token: drop it from the mutation cache as soon as nothing shows it.
    gcTime: 0,
    onSuccess: async (connection) => {
      // The answer is the new value, so the row reads "Manage" at once; the status line refetches.
      queryClient.setQueryData(queryKeys.githubConnection, connection);
      await queryClient.invalidateQueries({ queryKey: queryKeys.status });
    },
  });
}

/** Forgets the way GitHub was connected and deletes a saved token. gh stays signed in. */
export function useDisconnectGitHub() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: queryKeys.githubConnection,
    mutationFn: () => api.disconnectGitHub(),
    onSuccess: async () => {
      // Nothing is saved now, so the row reads "Connect" at once; the status line refetches.
      queryClient.setQueryData<GitHubConnection>(queryKeys.githubConnection, (old) => old && { ...old, saved: null });
      await queryClient.invalidateQueries({ queryKey: queryKeys.status });
    },
  });
}

/** Whether any tool is being connected or disconnected right now. */
export function useConnectionChangeRunning(): boolean {
  const jira = useIsMutating({ mutationKey: queryKeys.jiraConnection });
  const github = useIsMutating({ mutationKey: queryKeys.githubConnection });
  return jira + github > 0;
}

/** Settings › Coding agent and Inbox rules. Kept fresh by `settings.changed` events, not polling. */
export function usePreferences() {
  const api = useApi();
  return useQuery(preferencesQueryOptions(api));
}

function withChange(preferences: Preferences, change: PreferencesChange): Preferences {
  return {
    permissionMode: change.permissionMode ?? preferences.permissionMode,
    inboxRules: { ...preferences.inboxRules, ...change.inboxRules },
  };
}

/**
 * Saves one change, showing it at once (spec 005: "the control shows the new value straight away"). A
 * failed save puts back what was there before.
 */
export function useChangePreferences() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<Preferences, ApiRequestError, PreferencesChange, { before: Preferences | undefined }>({
    mutationKey: queryKeys.preferences,
    mutationFn: (change) => api.changePreferences(change),
    onMutate: async (change) => {
      // A refetch already on its way would land on top of the new value.
      await queryClient.cancelQueries({ queryKey: queryKeys.preferences });
      const before = queryClient.getQueryData<Preferences>(queryKeys.preferences);
      if (before) queryClient.setQueryData(queryKeys.preferences, withChange(before, change));
      return { before };
    },
    onError: (_error, _change, context) => {
      if (context?.before) queryClient.setQueryData(queryKeys.preferences, context.before);
    },
    onSettled: async () => {
      // Only after the last of several quick changes, so an early answer can't undo a later one on screen.
      if (queryClient.isMutating({ mutationKey: queryKeys.preferences }) === 1) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.preferences });
      }
    },
  });
}

/** Settings › Repositories. Kept fresh by `settings.changed` events, not polling. */
export function useRepositories() {
  const api = useApi();
  return useQuery(repositoriesQueryOptions(api));
}

/** The projects the saved Jira connection can see, asked only while the add-folder form is open and Jira is connected. */
export function useJiraProjects(enabled: boolean) {
  const api = useApi();
  return useQuery({ ...jiraProjectsQueryOptions(api), enabled });
}

/** Checks the folder on disk, then saves it. Fails with folder_rejected and the message for the Folder field. */
export function useAddRepository() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<Repository, ApiRequestError, AddRepositoryRequest>({
    mutationKey: queryKeys.repositories,
    mutationFn: (request) => api.addRepository(request),
    onSuccess: (folder) => {
      // The row shows at once; settings.changed then refetches the list to confirm it.
      queryClient.setQueryData<RepositoryList>(queryKeys.repositories, (old) =>
        old && !old.repositories.some((other) => other.id === folder.id)
          ? { repositories: [...old.repositories, folder] }
          : old,
      );
    },
  });
}

/** Forgets a folder, taking its row away at once (spec 005, AC-11). A failed save puts the row back. */
export function useRemoveRepository() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: queryKeys.repositories,
    mutationFn: (id: RepositoryId) => api.removeRepository(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.repositories });
      const before = queryClient.getQueryData<RepositoryList>(queryKeys.repositories);
      if (before) {
        queryClient.setQueryData<RepositoryList>(queryKeys.repositories, {
          repositories: before.repositories.filter((folder) => folder.id !== id),
        });
      }
      return { before };
    },
    onError: (_error, _id, context) => {
      if (context?.before) queryClient.setQueryData(queryKeys.repositories, context.before);
    },
    onSettled: async () => {
      if (queryClient.isMutating({ mutationKey: queryKeys.repositories }) === 1) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.repositories });
      }
    },
  });
}
