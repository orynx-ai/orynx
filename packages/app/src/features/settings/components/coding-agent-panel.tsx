import { useId } from 'react';
import {
  Alert02Icon,
  Cancel01Icon,
  ComputerIcon,
  Folder01Icon,
  GithubIcon,
  HelpCircleIcon,
  RoboticIcon,
  SecurityCheckIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { PermissionsSchema, type Permissions, type PreferencesChange } from '@devhub/contracts';
import {
  ChoiceCard,
  cn,
  Icon,
  Panel,
  Pill,
  SegmentedControl,
  SegmentedControlItem,
  Skeleton,
  type IconProps,
} from '@devhub/ui';
import { useChangePreferences, usePreferences } from '../queries.ts';
import {
  customLevel,
  levelOf,
  levels,
  permissionGroups,
  permissionRows,
  summaryOf,
  type PermissionRow,
} from '../permission-levels.ts';
import { AllowedCommands } from './allowed-commands.tsx';
import { ClaudeCard } from './claude-card.tsx';
import { EditorChoice } from './editor-choice.tsx';
import { OtherAgents } from './other-agents.tsx';
import { SaveError } from './save-error.tsx';
import { SectionHeading } from './section-heading.tsx';
import { ServerUnreachable } from './server-unreachable.tsx';

const groupIcons: Record<(typeof permissionGroups)[number]['id'], IconProps['icon']> = {
  copy: Folder01Icon,
  computer: ComputerIcon,
  github: GithubIcon,
};

/**
 * Settings › Coding agent, as the user's redesign draws it (19 Oct 2026): the agent (spec 010), what Claude may do
 * without asking (spec 026) as a level to start from, a summary and one row for each kind of call in three groups,
 * the allowed commands (spec 012) and the editor a session opens in (spec 013). Each is saved as you pick, and read
 * again for every call a session makes.
 */
export function CodingAgentPanel() {
  const preferences = usePreferences();
  const change = useChangePreferences();
  const agentId = useId();
  const headingId = useId();

  if (preferences.data === undefined && preferences.isError) return <ServerUnreachable />;
  // While loading, the same rows with nothing picked, so nothing moves when the answer comes.
  const picked = preferences.data?.permissions;
  const save = (permissions: NonNullable<PreferencesChange['permissions']>) => {
    change.mutate({ permissions });
  };

  return (
    <div className="@container flex flex-col gap-7">
      <section aria-labelledby={agentId} className="flex flex-col gap-2.5">
        <SectionHeading id={agentId} icon={RoboticIcon} title="Agent" />
        <ClaudeCard />
        <OtherAgents />
        <p className="m-0 text-small text-muted-foreground">
          More agents are coming later. Each one plugs in through the same small adapter, so these settings will apply
          to them too.
        </p>
      </section>
      <section aria-labelledby={headingId} className="flex flex-col gap-3.5">
        <SectionHeading
          id={headingId}
          icon={SecurityCheckIcon}
          title="What Claude can do without asking"
          line="Start from a level, then change any row. Anything set to Ask waits for your click in the session."
        />
        <Levels picked={picked} onPick={save} />
        <Summary picked={picked} />
        {permissionGroups.map((group) => (
          <Panel key={group.id} aria-label={group.title}>
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-sidebar px-4 py-3">
              <Icon icon={groupIcons[group.id]} aria-hidden className="text-muted-foreground" />
              <h3 className="m-0 text-body font-medium">{group.title}</h3>
              <Pill tone={group.tone}>{group.risk}</Pill>
              <span className="ms-auto text-small text-muted-foreground">{group.note}</span>
            </div>
            <div className="divide-y divide-border">
              {group.rows.map((row) => (
                <Row key={row} row={row} value={picked?.[row]} onPick={save} />
              ))}
            </div>
          </Panel>
        ))}
        {change.isError ? <SaveError /> : null}
      </section>
      <AllowedCommands />
      <EditorChoice />
    </div>
  );
}

/**
 * The levels to start from. The one whose rows match is picked, else Custom, which only a row can pick: it says so,
 * and stays out of reach until then.
 */
function Levels({ picked, onPick }: { picked: Permissions | undefined; onPick: (permissions: Permissions) => void }) {
  const current = picked === undefined ? undefined : levelOf(picked);
  return (
    <div role="radiogroup" aria-label="Permission level" className="grid gap-2.5 @lg:grid-cols-2 @3xl:grid-cols-4">
      {levels.map((level) => (
        <ChoiceCard
          key={level.id}
          name="permission-level"
          value={level.id}
          title={level.name}
          detail={level.detail}
          aside={level.recommended ? <Pill plain>Recommended</Pill> : undefined}
          checked={current === level.id}
          disabled={picked === undefined}
          onChange={() => {
            onPick(level.permissions);
          }}
        />
      ))}
      <ChoiceCard
        name="permission-level"
        value="custom"
        title={customLevel.name}
        detail={customLevel.detail}
        checked={current === 'custom'}
        disabled={current !== 'custom'}
        readOnly
      />
    </div>
  );
}

const summaryCells = [
  { key: 'free', title: 'Without asking', icon: Tick02Icon, tone: 'text-success' },
  { key: 'asks', title: 'Asks you first', icon: HelpCircleIcon, tone: 'text-warning' },
  { key: 'never', title: 'Never', icon: Cancel01Icon, tone: 'text-danger' },
] as const;

/** The rows in three lines: what Claude does without asking, what asks first, and what never happens. */
function Summary({ picked }: { picked: Permissions | undefined }) {
  const summary = picked === undefined ? undefined : summaryOf(picked);
  return (
    <Panel aria-label="Summary" className="grid divide-y divide-border @2xl:grid-cols-3 @2xl:divide-x @2xl:divide-y-0">
      {summaryCells.map((cell) => (
        <div key={cell.key} className="flex flex-col gap-1.5 px-4 py-3.5">
          <span className={cn('flex items-center gap-1.5 text-small font-medium', cell.tone)}>
            <Icon icon={cell.icon} aria-hidden className="size-4" />
            {cell.title}
          </span>
          {summary === undefined ? (
            <span className="flex h-5 items-center">
              <Skeleton className="h-4 w-40 max-w-full" />
            </span>
          ) : (
            <span className="text-small">{summary[cell.key]}</span>
          )}
        </div>
      ))}
    </Panel>
  );
}

/** One kind of call: its name and line, its options, and what Allow risks while it's picked. */
function Row({
  row,
  value,
  onPick,
}: {
  row: PermissionRow;
  value: string | undefined;
  onPick: (permissions: NonNullable<PreferencesChange['permissions']>) => void;
}) {
  const words = permissionRows[row];
  const helpId = useId();
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3.5">
      <div className="flex min-w-0 flex-1 basis-60 flex-col gap-0.5">
        <span className="font-medium">{words.title}</span>
        <span id={helpId} className="text-small text-muted-foreground">
          {words.help}
        </span>
      </div>
      <SegmentedControl
        aria-label={words.title}
        aria-describedby={helpId}
        value={value}
        onValueChange={(next) => {
          onPick(PermissionsSchema.partial().parse({ [row]: next }));
        }}
      >
        {words.choices.map((choice) => (
          <SegmentedControlItem
            key={choice.value}
            value={choice.value}
            disabled={value === undefined}
            {...(choice.value === 'never' ? { tone: 'danger' as const } : {})}
          >
            {choice.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      {value === 'allow' && words.warning !== undefined ? (
        <p className="m-0 flex basis-full items-start gap-1.5 text-small text-warning">
          <Icon icon={Alert02Icon} aria-hidden className="mt-0.5 size-4 shrink-0" />
          {words.warning}
        </p>
      ) : null}
    </div>
  );
}
