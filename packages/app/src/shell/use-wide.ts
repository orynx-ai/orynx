import { useSyncExternalStore } from 'react';

/** From 768 px (Tailwind's `md`): where the page bar meta shows and the narrow layouts switch back. */
const wideQuery = '(min-width: 768px)';

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(wideQuery);
  list.addEventListener('change', onChange);
  return () => {
    list.removeEventListener('change', onChange);
  };
}

/**
 * Whether the window is 768 px or wider, for a part that moves rather than restyles at that width, such as
 * Tickets' search field (spec 008, Q8g). Restyling stays in CSS (`md:`); this is only for moving a part, so
 * one copy of it exists at a time.
 */
export function useWide(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(wideQuery).matches,
    () => true,
  );
}
