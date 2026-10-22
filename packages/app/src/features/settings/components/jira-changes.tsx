import { useId } from 'react';
import { SettingList, SettingRow, Switch } from '@devhub/ui';
import { useChangePreferences, usePreferences } from '../queries.ts';
import { SaveError } from './save-error.tsx';

/** Spec 044, Q8. */
export const jiraChangesWords = {
  title: 'Claude changes Jira',
  description: 'Comments, status changes and assigning run without asking you first',
} as const;

/**
 * Settings › Coding agent's Claude changes Jira row (spec 044, Q8): off by default, so each comment, status change or
 * assignment Claude asks to make in Jira waits for your Allow; on, they run and still show as steps. Always allow on
 * the approval turns it on. Saved as you switch it, and taken back with the save error if the save fails.
 */
export function JiraChanges() {
  const preferences = usePreferences();
  const change = useChangePreferences();
  const titleId = useId();
  return (
    <div className="flex flex-col gap-2">
      <SettingList>
        <SettingRow
          title={jiraChangesWords.title}
          titleId={titleId}
          description={jiraChangesWords.description}
          control={
            <Switch
              aria-labelledby={titleId}
              checked={preferences.data?.jiraChanges === true}
              disabled={preferences.data === undefined}
              onCheckedChange={(next) => {
                change.mutate({ jiraChanges: next });
              }}
            />
          }
        />
      </SettingList>
      {change.isError ? <SaveError /> : null}
    </div>
  );
}
