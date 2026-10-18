import type { PermissionMode } from '@devhub/contracts';
import { Card, ChoiceCard, ChoiceGroup } from '@devhub/ui';
import { useChangePreferences, usePreferences } from '../queries.ts';
import { AllowedCommands } from './allowed-commands.tsx';
import { ClaudeCard } from './claude-card.tsx';
import { EditorChoice } from './editor-choice.tsx';
import { SaveError } from './save-error.tsx';
import { ServerUnreachable } from './server-unreachable.tsx';

/** The product spec's permission modes, in its order, with spec 005's lines (Q8a). */
const modes: readonly { value: PermissionMode; title: string; detail: string }[] = [
  {
    value: 'ask_everything',
    title: 'Ask before everything',
    detail: 'Every file edit and every command waits for your click.',
  },
  {
    value: 'edit_freely_ask_commands',
    title: 'Edit files freely, ask before commands',
    detail:
      "Recommended. Claude edits files in the session's own copy of the repository; every command waits for your click.",
  },
  {
    value: 'edit_and_run_allowed',
    title: 'Edit files and run allowed commands',
    detail: 'Commands on your allow list, such as npm test, run without asking. Anything else waits for your click.',
  },
];

/**
 * Settings › Coding agent: whether Claude is ready (spec 010), then what Claude may do without asking, and
 * the editor a session opens in (spec 013). Each is saved as you pick, and used once sessions run.
 */
export function CodingAgentPanel() {
  const preferences = usePreferences();
  const change = useChangePreferences();

  if (preferences.data === undefined && preferences.isError) return <ServerUnreachable />;
  // While loading, the same choices with none picked, so nothing moves when the answer comes.
  const picked = preferences.data?.permissionMode;

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
      <div className="flex flex-col gap-2">
        <ChoiceGroup
          legend="What Claude can do without asking"
          help={
            // Two lines, as the spec words them (Q8b).
            <>
              <span className="block">
                Commands that reach the network, delete outside the session&apos;s folder or push to git always ask,
                whatever you pick.
              </span>{' '}
              <span className="block">Claude never pushes code or opens a pull request by itself.</span>
            </>
          }
        >
          {modes.map((mode) => (
            <ChoiceCard
              key={mode.value}
              name="permission-mode"
              value={mode.value}
              title={mode.title}
              detail={mode.detail}
              checked={picked === mode.value}
              disabled={picked === undefined}
              onChange={() => {
                change.mutate({ permissionMode: mode.value });
              }}
            />
          ))}
        </ChoiceGroup>
        {change.isError ? <SaveError /> : null}
      </div>
      <AllowedCommands />
      <EditorChoice />
    </div>
  );
}
