import { Fragment } from 'react';
import { ClaudeIcon, CodeIcon } from '@hugeicons/core-free-icons';
import { Link } from '@tanstack/react-router';
import {
  EffortLevelSchema,
  type AgentChoice,
  type AgentId,
  type AgentModel,
  type EffortLevel,
} from '@devhub/contracts';
import {
  cn,
  Icon,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  Picker,
} from '@devhub/ui';
import { useStatus } from '../../settings/queries.ts';
import { composerWords } from '../composer-words.ts';
import { useAgentModels } from '../queries.ts';

const words = composerWords.agent;
/** Claude Code's own entry for its default model, and the effort row that leaves the level to the model. */
const defaultValue = 'default';

/** Claude's dot: `success` when connected, `warning` when signed out (Q10). Its name says which, too. */
function Dot({ connected, className }: { connected: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('size-2 shrink-0 rounded-full bg-current', connected ? 'text-success' : 'text-warning', className)}
    />
  );
}

/** The model picked, or Claude Code's default entry while none is; undefined when the list doesn't hold it. */
function shownModel(models: readonly AgentModel[], model: string | null): AgentModel | undefined {
  return models.find((listed) => listed.value === (model ?? defaultValue));
}

const agents: readonly AgentId[] = ['claude', 'codex'];

/**
 * What the picker works with (spec 052): whether each agent is signed in, the models each offers, and the agent in use:
 * the one picked, or the other while it's signed out and the other isn't. `only` is a session's own agent.
 */
function usePicked(agent: AgentId, only: AgentId | undefined) {
  const status = useStatus().data;
  const on: Record<AgentId, boolean> = {
    claude: status?.agents.claude.connected ?? false,
    codex: status?.agents.codex.connected ?? false,
  };
  const claude = useAgentModels('claude', on.claude && only !== 'codex').data;
  const codex = useAgentModels('codex', on.codex && only !== 'claude').data;
  const models: Record<AgentId, readonly AgentModel[]> = {
    claude: claude?.state === 'ready' ? claude.models : [],
    codex: codex?.state === 'ready' ? codex.models : [],
  };
  const other: AgentId = agent === 'claude' ? 'codex' : 'claude';
  const using: AgentId = only ?? (on[agent] || !on[other] ? agent : other);
  return { status, on, models, using };
}

/**
 * What a start sends for the picker's choice: the agent in use, only a model it still offers, and only an effort that
 * model takes. A model picked for the other agent gives way to this one's default, as does everything while the list
 * isn't in. Claude needs no name: a start without one runs on Claude (spec 052).
 */
export function useAgentChoice(
  model: string | null,
  effort: EffortLevel | null,
  agent: AgentId = 'claude',
  only?: AgentId,
): AgentChoice {
  const { models, using } = usePicked(agent, only);
  const own = using === agent;
  const named: AgentChoice = using === 'codex' ? { agent: 'codex' } : {};
  const shown = shownModel(models[using], own ? model : null);
  if (shown === undefined) return named;
  return {
    ...named,
    ...(own && model !== null ? { model: shown.value } : {}),
    ...(own && effort !== null && shown.efforts.includes(effort) ? { effort } : {}),
  };
}

export interface AgentPickerProps {
  /** The agent the model is from (spec 052). */
  agent?: AgentId;
  /** The model picked; null is the agent's own default. */
  model: string | null;
  /** The effort picked; null is the model's own default. */
  effort: EffortLevel | null;
  /** A session's own agent, the only one its follow-ups go to (spec 052). */
  only?: AgentId;
  onModelChange: (model: string | null, agent: AgentId) => void;
  onEffortChange: (effort: EffortLevel | null) => void;
}

/**
 * The composer's agent picker (`dh-picker`, spec 015, Q10): the agent, with the model and effort to work at, as each
 * agent lists them now. Its menu has each signed-in agent's models under its name (spec 052), then the effort levels
 * the picked one takes, and the way to Settings › Coding agent when the agent in use is signed out. Until a list is
 * in, or when no agent can say, the agent alone.
 */
export function AgentPicker({
  agent = 'claude',
  model,
  effort,
  only,
  onModelChange,
  onEffortChange,
}: AgentPickerProps) {
  const { status, on, models, using } = usePicked(agent, only);
  if (status === undefined) return null;
  const own = using === agent;
  const shown = shownModel(models[using], own ? model : null);
  const efforts = shown?.efforts ?? [];
  const shownEffort = own && effort !== null && efforts.includes(effort) ? effort : null;
  const name = words.names[using];
  const choice =
    shown === undefined
      ? undefined
      : `${shown.displayName}${shownEffort === null ? '' : ` · ${words.efforts[shownEffort]}`}`;
  const groups = (only === undefined ? agents : [only]).filter((one) => models[one].length > 0);
  // With Codex's models there, each group says whose they are; Claude's alone need no name.
  const named = groups.includes('codex');

  return (
    <Menu>
      <MenuTrigger asChild>
        <Picker
          icon={
            <span className="relative inline-flex shrink-0">
              <Icon icon={using === 'codex' ? CodeIcon : ClaudeIcon} aria-hidden />
              <Dot connected={on[using]} className="absolute -end-0.5 -bottom-0.5 size-1.5" />
            </span>
          }
          aria-label={words.label(on[using], choice, name)}
        >
          {choice ?? name}
        </Picker>
      </MenuTrigger>
      <MenuContent size="sm" aria-label={words.menu}>
        {groups.length === 0 ? (
          <MenuRadioGroup value={using}>
            <MenuRadioItem value={using} description={on[using] ? words.connected : words.signedOut}>
              {name}
            </MenuRadioItem>
          </MenuRadioGroup>
        ) : (
          groups.map((group, index) => (
            <Fragment key={group}>
              {index === 0 ? null : <MenuSeparator />}
              {named ? <MenuLabel>{words.names[group]}</MenuLabel> : null}
              <MenuRadioGroup
                // Nothing is checked while you've picked none and the agent lists no default of its own.
                value={group === using ? (shown?.value ?? '') : ''}
                onValueChange={(value) => {
                  onModelChange(value === defaultValue ? null : value, group);
                  // A level the new model doesn't take goes back to its default.
                  const next = models[group].find((listedModel) => listedModel.value === value);
                  if (effort !== null && next !== undefined && !next.efforts.includes(effort)) onEffortChange(null);
                }}
              >
                {models[group].map((listedModel) => (
                  <MenuRadioItem
                    key={listedModel.value}
                    value={listedModel.value}
                    description={listedModel.description}
                  >
                    {listedModel.displayName}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </Fragment>
          ))
        )}
        {efforts.length === 0 ? null : (
          <>
            <MenuSeparator />
            <MenuLabel>{words.effort}</MenuLabel>
            <MenuRadioGroup
              value={shownEffort ?? defaultValue}
              onValueChange={(value) => {
                const picked = EffortLevelSchema.safeParse(value);
                onEffortChange(picked.success ? picked.data : null);
              }}
            >
              <MenuRadioItem value={defaultValue}>{words.efforts.default}</MenuRadioItem>
              {efforts.map((level) => (
                <MenuRadioItem key={level} value={level}>
                  {words.efforts[level]}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </>
        )}
        {on[using] ? null : (
          <>
            <MenuSeparator />
            <MenuItem asChild>
              <Link to="/settings/$tab" params={{ tab: 'coding-agent' }}>
                {words.settings}
              </Link>
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
