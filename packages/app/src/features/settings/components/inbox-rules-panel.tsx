import { useId } from 'react';
import type { InboxRuleId } from '@devhub/contracts';
import { Checkbox } from '@devhub/ui';
import { useChangePreferences, usePreferences } from '../queries.ts';
import { SaveError } from './save-error.tsx';
import { ServerUnreachable } from './server-unreachable.tsx';

/** One row per rule, in the order of the product spec's "What counts as needs you" table (spec 005, Q8c). */
const rules: readonly { id: InboxRuleId; label: string }[] = [
  { id: 'jira_assigned', label: "Jira tickets assigned to me that aren't done" },
  { id: 'review_requested', label: 'Pull requests waiting for my review' },
  { id: 'checks_failing', label: 'My pull requests with failing checks' },
  { id: 'unresolved_comments', label: 'My pull requests with unresolved review comments' },
  { id: 'session_waiting', label: 'Claude sessions waiting for my approval' },
];

/**
 * Settings › Inbox rules: what shows up under Needs your attention on Home (spec 007 applies them). Saved
 * as you change them. Slack's rule and its wait time join in spec 016 (spec 005, Q6).
 */
export function InboxRulesPanel() {
  const introId = useId();
  const preferences = usePreferences();
  const change = useChangePreferences();

  if (preferences.data === undefined && preferences.isError) return <ServerUnreachable />;
  // While loading, the same rows unchecked, so nothing moves when the answer comes.
  const saved = preferences.data?.inboxRules;

  return (
    <div className="flex flex-col gap-2">
      <p id={introId} className="m-0 text-small text-muted-foreground">
        Choose what shows up under Needs your attention on Home.
      </p>
      <fieldset
        aria-labelledby={introId}
        className="m-0 flex min-w-0 flex-col divide-y divide-border rounded-md border border-border bg-raised px-4 py-0"
      >
        {rules.map((rule) => (
          <Checkbox
            key={rule.id}
            label={rule.label}
            checked={saved?.[rule.id] ?? false}
            disabled={saved === undefined}
            onChange={(event) => {
              change.mutate({ inboxRules: { [rule.id]: event.currentTarget.checked } });
            }}
          />
        ))}
      </fieldset>
      {change.isError ? <SaveError /> : null}
    </div>
  );
}
