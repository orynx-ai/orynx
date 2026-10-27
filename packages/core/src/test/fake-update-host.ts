import type { UpdateProgress } from '@devhub/contracts';
import type { UpdateHost } from '../updates/update-service.ts';

/**
 * The host's side, as the desktop app or a clone gives it: what it runs, and what Update and Restart do. Electron's
 * updater and a clone's git are outside core, so tests stand this in for them and see what was pressed.
 */
export function fakeHost(overrides: Partial<UpdateHost> = {}) {
  const pressed: string[] = [];
  let update: UpdateProgress = { state: 'idle' };
  const listeners = new Set<() => void>();
  const host: UpdateHost = {
    kind: 'desktop',
    folder: null,
    running: { release: '0.1.37', commits: 0, commit: null },
    state: () => ({ action: 'update', update }),
    update: (version) => {
      pressed.push(`update ${version}`);
      update = { state: 'downloading', version };
      for (const listener of listeners) listener();
      return Promise.resolve();
    },
    restart: () => {
      pressed.push('restart');
      return Promise.resolve();
    },
    watch: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ...overrides,
  };
  return {
    host,
    pressed,
    set: (next: UpdateProgress) => {
      update = next;
      for (const listener of listeners) listener();
    },
  };
}
