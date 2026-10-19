import { ClaudeIcon } from '@hugeicons/core-free-icons';
import { Link } from '@tanstack/react-router';
import { EffortLevelSchema, type AgentChoice, type AgentModel, type EffortLevel } from '@devhub/contracts';
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

/**
 * What a start sends for the picker's choice: only a model Claude still offers, and only an effort that model
 * takes. Anything else is left to Claude Code, as is everything while the list isn't in.
 */
export function useAgentChoice(model: string | null, effort: EffortLevel | null): AgentChoice {
  const connected = useStatus().data?.agent.connected ?? false;
  const listed = useAgentModels(connected).data;
  if (listed?.state !== 'ready') return {};
  const shown = shownModel(listed.models, model);
  if (shown === undefined) return {};
  return {
    ...(model === null ? {} : { model: shown.value }),
    ...(effort !== null && shown.efforts.includes(effort) ? { effort } : {}),
  };
}

export interface AgentPickerProps {
  /** The model picked; null is Claude Code's own default. */
  model: string | null;
  /** The effort picked; null is the model's own default. */
  effort: EffortLevel | null;
  onModelChange: (model: string | null) => void;
  onEffortChange: (effort: EffortLevel | null) => void;
}

/**
 * The composer's agent picker (`dh-picker`, spec 015, Q10): Claude, with the model and effort to work at, as
 * Claude Code lists them now. Its menu has the models, then the effort levels the picked one takes, and the way
 * to Settings › Coding agent when signed out. Until the list is in, or when Claude can't say, Claude alone.
 */
export function AgentPicker({ model, effort, onModelChange, onEffortChange }: AgentPickerProps) {
  const status = useStatus();
  const connected = status.data?.agent.connected ?? false;
  const listed = useAgentModels(connected).data;
  if (status.data === undefined) return null;
  const models = listed?.state === 'ready' ? listed.models : [];
  const shown = shownModel(models, model);
  const efforts = shown?.efforts ?? [];
  const shownEffort = effort !== null && efforts.includes(effort) ? effort : null;
  const choice =
    shown === undefined
      ? undefined
      : `${shown.displayName}${shownEffort === null ? '' : ` · ${words.efforts[shownEffort]}`}`;

  return (
    <Menu>
      <MenuTrigger asChild>
        <Picker
          icon={
            <span className="relative inline-flex shrink-0">
              <Icon icon={ClaudeIcon} aria-hidden />
              <Dot connected={connected} className="absolute -end-0.5 -bottom-0.5 size-1.5" />
            </span>
          }
          aria-label={words.label(connected, choice)}
        >
          {choice ?? words.name}
        </Picker>
      </MenuTrigger>
      <MenuContent aria-label={words.menu}>
        {models.length === 0 ? (
          <MenuRadioGroup value="claude">
            <MenuRadioItem value="claude" description={connected ? words.connected : words.signedOut}>
              {words.name}
            </MenuRadioItem>
          </MenuRadioGroup>
        ) : (
          <MenuRadioGroup
            // Nothing is checked while you've picked none and Claude Code lists no default of its own.
            value={shown?.value ?? ''}
            onValueChange={(value) => {
              onModelChange(value === defaultValue ? null : value);
              // A level the new model doesn't take goes back to its default.
              const next = models.find((listedModel) => listedModel.value === value);
              if (effort !== null && next !== undefined && !next.efforts.includes(effort)) onEffortChange(null);
            }}
          >
            {models.map((listedModel) => (
              <MenuRadioItem key={listedModel.value} value={listedModel.value} description={listedModel.description}>
                {listedModel.displayName}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
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
        {connected ? null : (
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
