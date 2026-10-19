import { useEffect, useEffectEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { usePlatform } from '../platform.tsx';
import { focusMainContent, focusNewTask } from './main-content.ts';
import { useSearchStore } from '../features/search/store.ts';
import { newTaskShortcut, searchShortcut } from './shortcuts.ts';

/** New task: open Home and put focus in its composer (spec 015, AC-2), keeping what's typed there. */
export function useNewTask(): () => void {
  const navigate = useNavigate();
  return () => {
    // Focus leaves the page being left at once; the composer takes it once Home is drawn.
    focusMainContent();
    void navigate({ to: '/' }).then(() => {
      requestAnimationFrame(focusNewTask);
    });
  };
}

/** Keyboard shortcuts that work on every page, even while typing, because they use a modifier. */
export function useGlobalShortcuts(): void {
  const platform = usePlatform();
  // An effect event, so the listener is added once instead of again on every render.
  const startNewTask = useEffectEvent(useNewTask());
  const toggleSearch = useSearchStore((state) => state.toggle);

  useEffect(() => {
    const newTask = newTaskShortcut(platform);
    const search = searchShortcut(platform);
    const onKeyDown = (event: KeyboardEvent) => {
      if (newTask.matches(event)) {
        event.preventDefault();
        startNewTask();
      } else if (search.matches(event)) {
        // ⌘K opens search, and closes it again when it's open (spec 009, Q2d). A held key repeats; only
        // the first press counts.
        event.preventDefault();
        if (!event.repeat) toggleSearch();
      }
    };
    // Capture phase, so a widget that stops keydown propagation can never swallow the shortcut.
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [platform, toggleSearch]);
}
