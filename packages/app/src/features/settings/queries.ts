import { useIsMutating, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  claudeLoginQueryOptions,
  githubConnectionQueryOptions,
  jiraConnectionQueryOptions,
  jiraProjectsQueryOptions,
  preferencesQueryOptions,
  queryKeys,
  repositoriesQueryOptions,
  orynxSkillsQueryOptions,
  statusQueryOptions,
  type ApiRequestError,
} from '@devhub/api-client';
import { InboxRuleIdSchema } from '@devhub/contracts';
import type {
  ClaudeLogin,
  GitHubConnection,
  GitHubConnectionRequest,
  JiraConnection,
  JiraConnectionRequest,
  Preferences,
  PreferencesChange,
  AddRepositoryRequest,
  FolderPick,
  ReadySkill,
  SaveSkillRequest,
  SkillFolder,
  Repository,
  RepositoryId,
  RepositoryList,
  UpdateRepositoryRequest,
} from '@devhub/contracts';
import { useApi } from '../../api.tsx';

/** What the hub is connected to. Kept fresh by `status.changed` events, not polling. */
export function useStatus() {
  const api = useApi();
  return useQuery(statusQueryOptions(api));
}

/** Claude Code's login, as the server last checked it (spec 010). Kept fresh by `status.changed`. */
export function useClaudeLogin() {
  const api = useApi();
  return useQuery(claudeLoginQueryOptions(api));
}

/** Check again: the server asks Claude Code now, and the card shows what it found. */
export function useCheckClaudeLogin() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<ClaudeLogin, ApiRequestError>({
    mutationKey: queryKeys.claudeLogin,
    mutationFn: () => api.checkClaudeLogin(),
    onSuccess: async (login) => {
      // The answer is the new login, so the card shows it at once; the footer's status line refetches.
      queryClient.setQueryData(queryKeys.claudeLogin, login);
      await queryClient.invalidateQueries({ queryKey: queryKeys.status });
    },
  });
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

/** The list with one entry added once, or one taken off (spec 012). */
function withCommandChange(list: readonly string[], change: PreferencesChange): string[] {
  const kept = list.filter((entry) => entry !== change.disallowCommand);
  const added = change.allowCommand;
  return added === undefined || kept.includes(added) ? kept : [...kept, added];
}

function withChange(preferences: Preferences, change: PreferencesChange): Preferences {
  return {
    permissionMode: change.permissionMode ?? preferences.permissionMode,
    inboxRules: { ...preferences.inboxRules, ...change.inboxRules },
    allowedCommands: withCommandChange(preferences.allowedCommands, change),
    editor: change.editor ?? preferences.editor,
  };
}

/**
 * Takes back one failed change and nothing else: each value it set goes back to the saved one, unless a
 * later change has set it again since. Other changes on their way stay on screen.
 */
function withoutChange(current: Preferences, change: PreferencesChange, saved: Preferences): Preferences {
  const inboxRules = { ...current.inboxRules };
  for (const rule of InboxRuleIdSchema.options) {
    const set = change.inboxRules?.[rule];
    if (set !== undefined && inboxRules[rule] === set) inboxRules[rule] = saved.inboxRules[rule];
  }
  const modeStillSet = change.permissionMode !== undefined && current.permissionMode === change.permissionMode;
  // An entry it added goes, and one it took off comes back where the server has it, unless a later change moved it.
  let allowedCommands = current.allowedCommands;
  if (change.allowCommand !== undefined && !saved.allowedCommands.includes(change.allowCommand)) {
    allowedCommands = allowedCommands.filter((entry) => entry !== change.allowCommand);
  }
  if (change.disallowCommand !== undefined && saved.allowedCommands.includes(change.disallowCommand)) {
    const back = change.disallowCommand;
    if (!allowedCommands.includes(back)) {
      const at = saved.allowedCommands.indexOf(back);
      allowedCommands = [...allowedCommands.slice(0, at), back, ...allowedCommands.slice(at)];
    }
  }
  const editorStillSet = change.editor !== undefined && current.editor === change.editor;
  return {
    permissionMode: modeStillSet ? saved.permissionMode : current.permissionMode,
    inboxRules,
    allowedCommands,
    editor: editorStillSet ? saved.editor : current.editor,
  };
}

interface PreferencesChangeContext {
  /**
   * What the server holds: the preferences from before the first change still on its way, moved
   * forward each time one of those changes is saved.
   */
  saved: Preferences | undefined;
}

function isChangeContext(context: unknown): context is PreferencesChangeContext {
  return typeof context === 'object' && context !== null && 'saved' in context;
}

/** The contexts of the preference changes still on their way, earliest first. */
function pendingChanges(queryClient: QueryClient): PreferencesChangeContext[] {
  return queryClient
    .getMutationCache()
    .findAll({ mutationKey: queryKeys.preferences, exact: true, status: 'pending' })
    .map((mutation) => mutation.state.context)
    .filter(isChangeContext);
}

/**
 * Saves one change, showing it at once (spec 005: "the control shows the new value straight away"). A
 * failed save takes back only its own change.
 */
export function useChangePreferences() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<Preferences, ApiRequestError, PreferencesChange, PreferencesChangeContext>({
    mutationKey: queryKeys.preferences,
    mutationFn: (change) => api.changePreferences(change),
    onMutate: async (change) => {
      // A refetch already on its way would land on top of the new value.
      await queryClient.cancelQueries({ queryKey: queryKeys.preferences });
      const current = queryClient.getQueryData<Preferences>(queryKeys.preferences);
      // The screen already shows earlier changes still on their way; the server holds what came before them.
      const earliest = pendingChanges(queryClient)[0];
      if (current) queryClient.setQueryData(queryKeys.preferences, withChange(current, change));
      return { saved: earliest?.saved ?? current };
    },
    onSuccess: (answer) => {
      // The server holds this answer now: a later change that fails goes back to it, not to older values.
      for (const context of pendingChanges(queryClient)) context.saved = answer;
    },
    onError: (_error, change, context) => {
      const saved = context?.saved;
      if (saved === undefined) return;
      queryClient.setQueryData<Preferences>(
        queryKeys.preferences,
        (current) => current && withoutChange(current, change, saved),
      );
    },
    onSettled: () => {
      refetchAfterLast(queryClient, queryKeys.preferences);
    },
  });
}

/**
 * Refetches only after the last of several quick changes to the same data, so an early answer (or an
 * early settings.changed) can't undo a later change on screen. Live updates hold back for the same reason.
 * Not awaited: the caller's own onSuccess, such as closing the folder dialog, shouldn't wait for it.
 */
function refetchAfterLast(queryClient: QueryClient, key: readonly string[]): void {
  if (queryClient.isMutating({ mutationKey: key }) === 1) void queryClient.invalidateQueries({ queryKey: key });
}

/** Settings › Repositories. Kept fresh by `settings.changed` events, not polling. */
export function useRepositories() {
  const api = useApi();
  return useQuery(repositoriesQueryOptions(api));
}

/** The projects the saved Jira connection can see, asked only while the folder dialog or Project picker is open and Jira is connected. */
export function useJiraProjects(enabled: boolean) {
  const api = useApi();
  return useQuery({ ...jiraProjectsQueryOptions(api), enabled });
}

/** Checks the folder on disk, then saves it. Fails with folder_rejected and the message for the Folder field. */
export function useAddRepository() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<Repository, ApiRequestError, AddRepositoryRequest>({
    mutationKey: [...queryKeys.repositories, 'add'],
    mutationFn: (request) => api.addRepository(request),
    onSuccess: (folder) => {
      // The row shows at once; settings.changed then refetches the list to confirm it.
      queryClient.setQueryData<RepositoryList>(queryKeys.repositories, (old) =>
        old && !old.repositories.some((other) => other.id === folder.id)
          ? { repositories: [...old.repositories, folder] }
          : old,
      );
    },
    onSettled: () => {
      refetchAfterLast(queryClient, queryKeys.repositories);
    },
  });
}

/**
 * Changes a folder's path or Jira project (spec 020), with the checks adding makes. Fails with
 * folder_rejected for the Folder field, or not_found when another tab removed it.
 */
export function useEditRepository() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<Repository, ApiRequestError, { id: RepositoryId; request: UpdateRepositoryRequest }>({
    mutationKey: [...queryKeys.repositories, 'edit'],
    mutationFn: ({ id, request }) => api.editRepository(id, request),
    onSuccess: (folder) => {
      // The row changes at once; settings.changed then refetches the list to confirm it.
      queryClient.setQueryData<RepositoryList>(
        queryKeys.repositories,
        (old) => old && { repositories: old.repositories.map((other) => (other.id === folder.id ? folder : other)) },
      );
    },
    onSettled: () => {
      refetchAfterLast(queryClient, queryKeys.repositories);
    },
  });
}

/**
 * Choose folder (spec 020): the server opens the computer's folder picker and answers the path picked, null
 * on Cancel, or fails with picker_unavailable where none can open. It saves nothing.
 */
export function useChooseFolder() {
  const api = useApi();
  return useMutation<FolderPick, ApiRequestError>({ mutationFn: () => api.pickFolder() });
}

/** Forgets a folder, taking its row away at once (spec 005, AC-11). A failed save puts back that row alone. */
export function useRemoveRepository() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...queryKeys.repositories, 'remove'],
    mutationFn: (id: RepositoryId) => api.removeRepository(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.repositories });
      const before = queryClient.getQueryData<RepositoryList>(queryKeys.repositories)?.repositories ?? [];
      const index = before.findIndex((folder) => folder.id === id);
      queryClient.setQueryData<RepositoryList>(
        queryKeys.repositories,
        (current) => current && { repositories: current.repositories.filter((folder) => folder.id !== id) },
      );
      return { removed: before[index], index };
    },
    onError: (_error, _id, context) => {
      if (context?.removed === undefined) return;
      const { removed, index } = context;
      queryClient.setQueryData<RepositoryList>(queryKeys.repositories, (current) => {
        if (current === undefined || current.repositories.some((folder) => folder.id === removed.id)) return current;
        const repositories = [...current.repositories];
        repositories.splice(Math.min(index, repositories.length), 0, removed);
        return { repositories };
      });
    },
    onSettled: () => {
      refetchAfterLast(queryClient, queryKeys.repositories);
    },
  });
}

/**
 * Clear cache (spec 007, Q7): the server empties `cache.db`, says `inbox.changed` and syncs again, so
 * nothing here touches the cached list.
 */
export function useClearInboxCache() {
  const api = useApi();
  return useMutation({ mutationKey: [...queryKeys.inbox, 'clear'], mutationFn: () => api.clearInboxCache() });
}

/** Settings › Skills (spec 023): your skills by Name. Kept fresh by `skills.changed`, not polling. */
export function useSkills() {
  const api = useApi();
  return useQuery(orynxSkillsQueryOptions(api));
}

/** Adds the four starter skills whose folders are free (AC-13); the list reads them again when it lands. */
export function useAddStarterSkills() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...queryKeys.orynxSkills, 'starters'],
    mutationFn: () => api.addStarterSkills(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.skills }),
  });
}

/**
 * Saves a skill. The list reads itself again before the save settles, so a rename's new folder is listed by the
 * time the editor opens it.
 */
export function useSaveSkill() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<ReadySkill, ApiRequestError, { folder: SkillFolder; request: SaveSkillRequest }>({
    mutationKey: [...queryKeys.orynxSkills, 'save'],
    mutationFn: ({ folder, request }) => api.saveOrynxSkill(folder, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.skills }),
  });
}

/** Writes a new skill; listed before the save settles, as {@link useSaveSkill}. */
export function useAddSkill() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<ReadySkill, ApiRequestError, SaveSkillRequest>({
    mutationKey: [...queryKeys.orynxSkills, 'add'],
    mutationFn: (request) => api.addOrynxSkill(request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.skills }),
  });
}

/** Deletes a skill's folder; the list reads itself again before the delete settles. */
export function useRemoveSkill() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<unknown, ApiRequestError, SkillFolder>({
    mutationKey: [...queryKeys.orynxSkills, 'remove'],
    mutationFn: (folder) => api.removeOrynxSkill(folder),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.skills }),
  });
}
