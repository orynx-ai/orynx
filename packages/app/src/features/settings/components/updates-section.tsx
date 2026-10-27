import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { Updates } from '@devhub/contracts';
import { Button, CommandBlock, CopyButton, SettingRow } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { useConnectionStore } from '../../../stores/connection-store.ts';
import { useNow } from '../../../words/use-now.ts';
import { useCheckForUpdates, useInstallUpdate } from '../queries.ts';
import { checkedText, refusalLines, updateCommands } from '../update-words.ts';

/** The newest release, when it is newer than the version you run. */
function newerRelease({ releases }: Updates) {
  const newest = releases[0];
  return newest?.newer === true ? newest : null;
}

/**
 * Settings › About's Updates (spec 045): one line for where things stand, and what you can do about it (Q7). Check
 * for updates stays in the same place in each state that offers it, so focus stays on it while it checks (AC-8).
 */
export function UpdatesRow({ updates }: { updates: Updates }) {
  const ids = { title: useId(), reason: useId() };
  const check = useCheckForUpdates();
  const install = useInstallUpdate();
  const platform = usePlatform();
  const now = useNow();
  const stale = useConnectionStore((state) => state.stale);
  // Set once this page pressed Update in a clone: the hub comes back with a new token, so the page reloads (AC-25).
  const reloadWhenBack = useRef(false);
  useEffect(() => {
    if (stale && reloadWhenBack.current) platform.reload();
  }, [stale, platform]);

  const { update, busy } = updates;
  const newer = newerRelease(updates);
  const run = (step: 'update' | 'restart') => {
    reloadWhenBack.current = step === 'update' && updates.kind === 'service';
    install.mutate({ step });
  };
  // Waits while a session works or waits for you, and says why (AC-22, AC-29).
  const installButton = (label: string, step: 'update' | 'restart') => (
    <Button
      variant="primary"
      size="sm"
      disabled={busy}
      aria-describedby={busy ? ids.reason : undefined}
      pending={install.isPending}
      onClick={() => {
        run(step);
      }}
    >
      {label}
    </Button>
  );

  let line: string;
  let action: ReactNode = null;
  let checks = false;
  switch (update.state) {
    case 'updating':
      line = 'Updating Orynx. This page reloads when it’s back.';
      break;
    case 'downloading':
      line = `Downloading Orynx ${update.version}…`;
      break;
    case 'ready':
      line = `Orynx ${update.version} is out.`;
      action = installButton('Restart to update', 'restart');
      break;
    case 'failed':
      line = update.log === null ? 'Couldn’t update Orynx.' : `Couldn’t update Orynx. See ${update.log}.`;
      action = installButton('Try again', 'update');
      break;
    case 'refused':
      line = refusalLines[update.reason];
      action = newer === null ? null : installButton('Update', 'update');
      checks = true;
      break;
    case 'idle':
      checks = true;
      if (updates.checkFailed) line = 'Couldn’t check for updates.';
      else if (updates.releases.length === 0) line = 'No releases yet.';
      else if (newer === null) line = 'Orynx is up to date.';
      else {
        line = `Orynx ${newer.version} is out.`;
        if (updates.action === 'update') action = installButton('Update', 'update');
        if (updates.action === 'download') {
          action = (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                platform.openExternal(newer.url);
              }}
            >
              Download
            </Button>
          );
        }
      }
  }

  const waiting = busy && action !== null && updates.action !== 'download';
  return (
    <SettingRow
      role="group"
      aria-labelledby={ids.title}
      title={line}
      description={
        waiting ? (
          <span id={ids.reason}>Stop the running sessions first</span>
        ) : checks && updates.checkedAt !== null ? (
          checkedText(updates.checkedAt, now)
        ) : undefined
      }
      control={
        action === null && !checks ? undefined : (
          <>
            {action}
            {checks ? (
              <Button
                variant="secondary"
                size="sm"
                pending={check.isPending || updates.checking}
                onClick={() => {
                  check.mutate();
                }}
              >
                {updates.checkFailed ? 'Try again' : 'Check for updates'}
              </Button>
            ) : null}
          </>
        )
      }
    >
      {/* The group's name: Settings › About's part, which the line under it changes with each state. */}
      <span id={ids.title} className="sr-only">
        Updates
      </span>
    </SettingRow>
  );
}

/** For a clone started by hand, the commands to update it, with a copy button (AC-30). */
export function UpdateCommands({ updates }: { updates: Updates }) {
  if (updates.action !== 'commands' || newerRelease(updates) === null || updates.update.state !== 'idle') return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-small">
        To update, run this in <code className="font-mono text-code">{updates.folder}</code>, then start Orynx again:
      </p>
      <CommandBlock
        command={updateCommands}
        tone="neutral"
        actions={<CopyButton text={updateCommands} label="Copy" what="Copy the commands" />}
      />
    </div>
  );
}
