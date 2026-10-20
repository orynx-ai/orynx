import type { Platform } from '../platform.tsx';

export interface Shortcut {
  /** What the sidebar shows, for example "⌥⌘N". */
  label: string;
  /** The same keys for screen readers (`aria-keyshortcuts`), for example "Alt+Meta+N". */
  ariaKeyShortcuts: string;
  matches(event: KeyboardEvent): boolean;
}

interface Keys {
  meta?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  code: string;
}

function matcher({ meta = false, ctrl = false, alt = false, code }: Keys) {
  return (event: KeyboardEvent) =>
    event.code === code &&
    event.metaKey === meta &&
    event.ctrlKey === ctrl &&
    event.altKey === alt &&
    !event.shiftKey &&
    // AltGr arrives as Ctrl+Alt on Windows and types letters like "ń"; never take it.
    !event.getModifierState('AltGraph');
}

/**
 * New task. A browser tab never receives ⌘N or Ctrl+N (the browser keeps them for a new
 * window), so the web app uses ⌥⌘N or Ctrl+Alt+N; a desktop host gets plain ⌘N (spec 001, Q1).
 */
export function newTaskShortcut({ kind, os }: Pick<Platform, 'kind' | 'os'>): Shortcut {
  const alt = kind === 'web';
  if (os === 'mac') {
    return {
      label: alt ? '⌥⌘N' : '⌘N',
      ariaKeyShortcuts: alt ? 'Alt+Meta+N' : 'Meta+N',
      matches: matcher({ meta: true, alt, code: 'KeyN' }),
    };
  }
  return {
    label: alt ? 'Ctrl+Alt+N' : 'Ctrl+N',
    ariaKeyShortcuts: alt ? 'Control+Alt+N' : 'Control+N',
    matches: matcher({ ctrl: true, alt, code: 'KeyN' }),
  };
}

/** Search (spec 009): ⌘K on a Mac, Ctrl+K elsewhere. Browsers let a page take it, as GitHub and Slack do. */
export function searchShortcut({ os }: Pick<Platform, 'os'>): Shortcut {
  if (os === 'mac') return { label: '⌘K', ariaKeyShortcuts: 'Meta+K', matches: matcher({ meta: true, code: 'KeyK' }) };
  return { label: 'Ctrl+K', ariaKeyShortcuts: 'Control+K', matches: matcher({ ctrl: true, code: 'KeyK' }) };
}

/** The session's Terminal (spec 036): ⌃` on every computer, as editors open their terminal. */
export function terminalShortcut({ os }: Pick<Platform, 'os'>): Shortcut {
  return {
    label: os === 'mac' ? '⌃`' : 'Ctrl+`',
    ariaKeyShortcuts: 'Control+`',
    matches: matcher({ ctrl: true, code: 'Backquote' }),
  };
}
