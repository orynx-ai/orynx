import { useEffect } from 'react';
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
  const newTask = useNewTask();

  useEffect(() => {
    const shortcut = newTaskShortcut(platform);
    const onKeyDown = (event: KeyboardEvent) => {
      if (!shortcut.matches(event)) return;
      event.preventDefault();
      newTask();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [platform, newTask]);
}
