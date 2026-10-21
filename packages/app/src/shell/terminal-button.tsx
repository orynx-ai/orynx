import { useRef } from 'react';
import { useMatchRoute } from '@tanstack/react-router';
import { ComputerTerminal01Icon } from '@hugeicons/core-free-icons';
import { Icon, IconButton, type IconButtonProps } from '@devhub/ui';
import { SessionTerminal } from '../features/sessions/components/terminal/session-terminal.tsx';
import { terminalWords } from '../features/sessions/components/terminal/terminal-words.ts';
import { usePlatform } from '../platform.tsx';
import { terminalShortcut } from './shortcuts.ts';

/**
 * Terminal beside the bell: your shell in Orynx's home folder, from any page (the user moved it here from Home's
 * page bar, 21 Oct 2026). Shown on Windows too, where the server has no terminal and the dialog says it can't reach it.
 * `⌃`` opens it anywhere but a Session screen, where the key is the session's Terminal (spec 036, AC-3).
 */
export function TerminalButton({ tooltipSide }: { tooltipSide: IconButtonProps['tooltipSide'] }) {
  const button = useRef<HTMLButtonElement>(null);
  const terminal = useRef<{ open: () => void }>(null);
  const platform = usePlatform();
  const onSession = useMatchRoute()({ to: '/sessions/$sessionId' }) !== false;
  return (
    <>
      <IconButton
        ref={button}
        variant="ghost"
        size="sm"
        label={terminalWords.button}
        tooltipSide={tooltipSide}
        aria-keyshortcuts={onSession ? undefined : terminalShortcut(platform).ariaKeyShortcuts}
        onClick={() => terminal.current?.open()}
      >
        <Icon icon={ComputerTerminal01Icon} aria-hidden />
      </IconButton>
      <SessionTerminal ref={terminal} session={null} returnTo={button} shortcut={!onSession} />
    </>
  );
}
