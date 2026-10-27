import {
  DesktopUpdateStateSchema,
  OrynxVersionSchema,
  type DesktopUpdateState,
  type HubUpdateCommand,
} from '@devhub/contracts';
import type { UpdateHost } from '@devhub/core';

/** The part of Electron's `process.parentPort` the hub uses, inside the desktop app's utility process. */
export interface ParentPort {
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
}

export interface DesktopUpdateHostOptions {
  port: ParentPort;
  /** The version stamped into the packed app. */
  version: string;
  /** A warning for the hub's log. */
  log: (line: string) => void;
}

/**
 * The desktop app's updates (spec 045): Electron's updater keeps its job, and tells the hub how far it has got over
 * the utility process's port. The page still talks only to the hub, and the window still gets no preload.
 */
export function desktopUpdateHost({ port, version, log }: DesktopUpdateHostOptions): UpdateHost {
  let state: Omit<DesktopUpdateState, 'type'> = { action: 'none', update: { state: 'idle' } };
  const listeners = new Set<() => void>();

  function set(next: typeof state): void {
    state = next;
    for (const listener of listeners) listener();
  }

  function send(command: HubUpdateCommand): void {
    port.postMessage(command);
  }

  port.on('message', ({ data }) => {
    const message = DesktopUpdateStateSchema.safeParse(data);
    if (!message.success) {
      log("Orynx couldn't read a message from the desktop app's updater.");
      return;
    }
    set({ action: message.data.action, update: message.data.update });
  });

  return {
    kind: 'desktop',
    folder: null,
    running: { release: OrynxVersionSchema.safeParse(version).data ?? null, commits: 0, commit: null },
    state: () => state,
    update(next) {
      send({ type: 'download', version: next });
      set({ ...state, update: { state: 'downloading', version: next } });
      return Promise.resolve();
    },
    restart() {
      send({ type: 'restart' });
      return Promise.resolve();
    },
    watch(changed) {
      listeners.add(changed);
      return () => listeners.delete(changed);
    },
  };
}
