import { z } from 'zod';

export const ApiErrorCodeSchema = z.enum([
  'forbidden_host',
  'unauthorized',
  'bad_request',
  'not_found',
  /** The OS keychain is locked, refused access or does not exist, so a token can't be read or saved (spec 002). */
  'keychain_unavailable',
  /** Jira, GitHub or Slack refused the credentials it was given (spec 003). */
  'integration_rejected',
  /** The tool can't be reached at that address: no such site, the network, a timeout or the tool's own error (spec 003). */
  'integration_unreachable',
  /** The folder can't be added to Settings › Repositories: nothing there, not a git repository, already listed (spec 005). */
  'folder_rejected',
  /** The call was answered already, by another tab or by Stop (spec 012); the first answer counts. */
  'already_answered',
  /** Settings couldn't be saved, so an Always allow decided nothing (spec 012, AC-14). */
  'settings_unsaved',
  /** No folder picker can open on this computer, so the path is typed instead (spec 020, AC-36). */
  'picker_unavailable',
  /** A skill can't be saved under that Name: another of your skills has its folder (spec 023, AC-7). */
  'skill_rejected',
  'internal',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

/** The body of every non-2xx response from the local server. */
export const ApiErrorSchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
