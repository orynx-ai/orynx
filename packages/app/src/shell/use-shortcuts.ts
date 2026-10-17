import { useEffect, useEffectEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { usePlatform } from '../platform.tsx';
import { focusMainContent } from './main-content.ts';
import { newTaskShortcut } from './shortcuts.ts';

/** New task: open Home and put focus on its content (the composer, once spec 015 ships). */
export function useNewTask(): () => void {
  const navigate = useNavigate();
  return () => {
    focusMainContent();
    void navigate({ to: '/' });
  };
}

/** Keyboard shortcuts that work on every page, even while typing, because they use a modifier. */
export function useGlobalShortcuts(): void {
  const platform = usePlatform();
  // An effect event, so the listener is added once instead of again on every render.
  const startNewTask = useEffectEvent(useNewTask());

  useEffect(() => {
    const shortcut = newTaskShortcut(platform);
    const onKeyDown = (event: KeyboardEvent) => {
      if (!shortcut.matches(event)) return;
      event.preventDefault();
      startNewTask();
    };
    // Capture phase, so a widget that stops keydown propagation can never swallow the shortcut.
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [platform]);
}
