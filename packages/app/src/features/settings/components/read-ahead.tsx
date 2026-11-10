import { useId } from 'react';
import { SettingList, SettingRow, Switch } from '@devhub/ui';
import { useChangePreferences, usePreferences } from '../queries.ts';
import { SaveError } from './save-error.tsx';

/** Spec 057, Q9. */
export const readAheadWords = {
  title: 'Read review requests ahead',
  description:
    'Claude reviews each new request in the background, so a draft is ready when you open it. Nothing is posted until you press Post. Uses your Claude plan.',
} as const;

/**
 * Settings › Coding agent's Read review requests ahead row (spec 057, D): off by default, since it starts sessions
 * without a press and uses your plan; on, each review request that arrives after starts spec 050's review, read-only.
 * Saved as you switch it, and taken back with the save error if the save fails.
 */
export function ReadAhead() {
  const preferences = usePreferences();
  const change = useChangePreferences();
  const titleId = useId();
  return (
    <div className="flex flex-col gap-2">
      <SettingList>
        <SettingRow
          title={readAheadWords.title}
          titleId={titleId}
          description={readAheadWords.description}
          control={
            <Switch
              aria-labelledby={titleId}
              checked={preferences.data?.readReviewsAhead === true}
              disabled={preferences.data === undefined}
              onCheckedChange={(next) => {
                change.mutate({ readReviewsAhead: next });
              }}
            />
          }
        />
      </SettingList>
      {change.isError ? <SaveError /> : null}
    </div>
  );
}
