import { useId } from 'react';
import { PermissionsSchema, type Permissions } from '@devhub/contracts';
import { Card, Field, Select } from '@devhub/ui';
import { useChangePreferences, usePreferences } from '../queries.ts';
import { AllowedCommands } from './allowed-commands.tsx';
import { ClaudeCard } from './claude-card.tsx';
import { EditorChoice } from './editor-choice.tsx';
import { SaveError } from './save-error.tsx';
import { ServerUnreachable } from './server-unreachable.tsx';

const ask = { value: 'ask', label: 'Ask first' };
const allow = { value: 'allow', label: 'Allow' };
const never = { value: 'never', label: 'Never' };

/** One row for each kind of call (spec 026, the user's call of 20 Oct 2026), in the order a call reaches further. */
const rows: readonly {
  row: keyof Permissions;
  label: string;
  help: string;
  choices: readonly { value: string; label: string }[];
}[] = [
  {
    row: 'edits',
    label: 'Edit files',
    help: "In the session's own copy of the repository. Edits anywhere else are refused.",
    choices: [ask, allow],
  },
  {
    row: 'commands',
    label: 'Run commands',
    help: "In a sandbox with no network that writes only to the session's copy.",
    choices: [ask, { value: 'allowed_list', label: 'Only allowed commands' }, { value: 'any', label: 'Any command' }],
  },
  {
    row: 'network',
    label: 'Commands that use the network',
    help: 'Such as npm install, curl or git fetch. Allowed, they run outside the sandbox.',
    choices: [ask, allow],
  },
  {
    row: 'deleteOutside',
    label: "Deleting outside the session's copy",
    help: 'Such as rm ~/notes.txt. Allowed, it runs outside the sandbox.',
    choices: [ask, allow],
  },
  {
    row: 'unsandboxed',
    label: 'Commands outside the sandbox',
    help: "When Claude asks to run one there. One Orynx can't read always asks.",
    choices: [ask, allow],
  },
  {
    row: 'push',
    label: 'Push the branch',
    help: "Only the session's branch to origin, never forced, with your own git login.",
    choices: [never, ask, allow],
  },
  {
    row: 'pullRequest',
    label: 'Open a pull request',
    help: "With gh pr create for the session's branch, as you on GitHub.",
    choices: [never, ask, allow],
  },
];

/**
 * Settings › Coding agent: whether Claude is ready (spec 010), then what Claude may do without asking, one row for
 * each kind of call (spec 026), and the editor a session opens in (spec 013). Each is saved as you pick, and read
 * again for every call a session makes.
 */
export function CodingAgentPanel() {
  const preferences = usePreferences();
  const change = useChangePreferences();
  const headingId = useId();

  if (preferences.data === undefined && preferences.isError) return <ServerUnreachable />;
  // While loading, the same rows with nothing picked, so nothing moves when the answer comes.
  const picked = preferences.data?.permissions;

  return (
    <div className="flex flex-col gap-5">
      {/* Side by side once the tab is 512 px wide (the design's two 260 px columns, near enough), stacked
          below that. The row stretches both cards to the taller one. */}
      <div className="@container">
        <div className="grid gap-3 @lg:grid-cols-2">
          <ClaudeCard />
          <Card title="More agents" look="placeholder">
            <p className="m-0 text-small text-muted-foreground">
              Coming later. Each agent plugs in through one small adapter.
            </p>
          </Card>
        </div>
      </div>
      <section aria-labelledby={headingId} className="@container flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="m-0 text-body font-medium">
            What Claude can do without asking
          </h2>
          <p className="m-0 text-small text-muted-foreground">
            Each row decides one kind of call. A call that asks waits for your click in the session.
          </p>
        </div>
        <div className="grid gap-4 @lg:grid-cols-2">
          {rows.map(({ row, label, help, choices }) => (
            <Field key={row} label={label} help={help}>
              <Select
                value={picked?.[row] ?? ''}
                disabled={picked === undefined}
                onChange={(event) => {
                  change.mutate({ permissions: PermissionsSchema.partial().parse({ [row]: event.target.value }) });
                }}
              >
                {picked === undefined ? <option value="" /> : null}
                {choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
        </div>
        {change.isError ? <SaveError /> : null}
      </section>
      <AllowedCommands />
      <EditorChoice />
    </div>
  );
}
