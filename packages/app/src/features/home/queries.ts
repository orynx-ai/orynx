import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ComposerStart, FileCheckAnswer, FileCheckRequest, FilePicks, InboxItem } from '@devhub/contracts';
import {
  inboxQueryOptions,
  preferencesQueryOptions,
  queryKeys,
  skillsQueryOptions,
  type ApiRequestError,
} from '@devhub/api-client';
import { useApi } from '../../api.tsx';

/** A row of Home's list. A Claude session on neither a ticket nor a pull request has no tool (spec 015, AC-24). */
export type HomeItem = InboxItem;

/** Home's "Needs your attention" list. Kept fresh by `inbox.changed`, `settings.changed` and `status.changed`. */
export function useInbox() {
  const api = useApi();
  return useQuery(inboxQueryOptions(api));
}

/** How many rows need you, for the sidebar; undefined until the list has loaded. */
export function useInboxCount(): number | undefined {
  const api = useApi();
  return useQuery({ ...inboxQueryOptions(api), select: (inbox) => inbox.items.length }).data;
}

/** Settings › Inbox rules, to say why a tab is empty. Kept fresh by `settings.changed`. */
export function useInboxRules() {
  const api = useApi();
  return useQuery({ ...preferencesQueryOptions(api), select: (preferences) => preferences.inboxRules });
}

/**
 * Refresh: syncs now and resolves once the sync has ended. It stays pending until the new list is in, so
 * the page bar reads "Synced just now" the moment the spinner stops (AC-17).
 */
export function useRefreshInbox() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...queryKeys.inbox, 'refresh'],
    mutationFn: () => api.refreshInbox(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.inbox }),
  });
}

/** Send in Home's composer (spec 015): starts a session from your message and chips, or says why it can't. */
export function useStartFromComposer() {
  const api = useApi();
  return useMutation({ mutationFn: (request: ComposerStart) => api.startSession(request) });
}

/** File from this computer (spec 022): the computer's own file picker, through the server. */
export function usePickFiles() {
  const api = useApi();
  return useMutation<FilePicks, ApiRequestError>({ mutationFn: () => api.pickFiles() });
}

/** Add a file's check of a typed path, when no picker can open (spec 022, AC-12). */
export function useCheckFile() {
  const api = useApi();
  return useMutation<FileCheckAnswer, ApiRequestError, FileCheckRequest>({
    mutationFn: (request) => api.checkFile(request),
  });
}

/** The skills for the shown folder, or yours alone (spec 022): asked for only once the `/` list opens. */
export function useSkills(repositoryId: string | null, enabled: boolean) {
  const api = useApi();
  return useQuery({ ...skillsQueryOptions(api, repositoryId), enabled });
}
