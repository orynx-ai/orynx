import { useEffect, useId, useState } from 'react';
import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { Button, Icon, SettingList, SettingRow, Switch } from '@devhub/ui';
import { useAgentsAccess, useMcpConfig, useSetAgentsAccess } from '../queries.ts';
import { SaveError } from './save-error.tsx';

/** Spec 037, Q12m. */
export const otherAgentsWords = {
  title: 'Other agents',
  description:
    'Let Claude Code, Cursor, Codex or any MCP client use Orynx tickets on this computer. They can read, create and edit tickets, but not delete them.',
  copy: 'Copy MCP config',
  copied: 'Copied',
  notCopied: "The config didn't copy. Try again.",
} as const;

/**
 * Settings › Coding agent's Other agents row (spec 037, AC-39, AC-40): a switch, off by default, that lets agents
 * outside Orynx use its tickets through its MCP server; while it's on, Copy MCP config copies the config to paste into
 * that agent. The config names a small bridge Orynx writes, never a token. Turning it off makes every config copied
 * before stop working.
 */
export function OtherAgents() {
  const access = useAgentsAccess();
  const set = useSetAgentsAccess();
  const enabled = access.data?.enabled === true;
  const config = useMcpConfig(enabled);
  const titleId = useId();
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);

  useEffect(() => {
    if (copied !== 'yes') return;
    const timer = setTimeout(() => {
      setCopied(null);
    }, 2000);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);

  return (
    <div className="flex flex-col gap-2">
      <SettingList>
        <SettingRow
          title={otherAgentsWords.title}
          titleId={titleId}
          description={otherAgentsWords.description}
          control={
            <>
              {enabled ? (
                <Button
                  size="sm"
                  disabled={config.data === undefined}
                  onClick={() => {
                    if (config.data === undefined) return;
                    navigator.clipboard.writeText(config.data.config).then(
                      () => {
                        setCopied('yes');
                      },
                      () => {
                        setCopied('failed');
                      },
                    );
                  }}
                >
                  <Icon icon={copied === 'yes' ? Tick02Icon : Copy01Icon} aria-hidden />
                  {copied === 'yes' ? otherAgentsWords.copied : otherAgentsWords.copy}
                </Button>
              ) : null}
              <Switch
                aria-labelledby={titleId}
                checked={enabled}
                disabled={access.data === undefined || set.isPending}
                onCheckedChange={(next) => {
                  setCopied(null);
                  set.mutate(next);
                }}
              />
            </>
          }
        />
      </SettingList>
      {set.isError ? <SaveError /> : null}
      {copied === 'failed' || config.isError ? (
        <p role="alert" className="m-0 text-small text-danger">
          {otherAgentsWords.notCopied}
        </p>
      ) : null}
    </div>
  );
}
