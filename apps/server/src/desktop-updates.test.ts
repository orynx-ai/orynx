import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { DesktopUpdateStateSchema, HubUpdateCommandSchema } from '@devhub/contracts';
// The desktop app's own copy of the messages: it imports no @devhub package (spec 027).
import { UpdateCommandSchema, UpdateStateSchema } from '../../desktop/src/updates.ts';
import { desktopUpdateHost, type ParentPort } from './desktop-updates.ts';

/** The utility process's port to the desktop app: Electron's, outside the hub, so the test holds both ends. */
function fakePort() {
  const sent: unknown[] = [];
  const listeners: ((event: { data: unknown }) => void)[] = [];
  const port: ParentPort = {
    on: (_event, listener) => {
      listeners.push(listener);
    },
    postMessage: (message) => {
      sent.push(message);
    },
  };
  return {
    port,
    sent,
    tell: (data: unknown) => {
      for (const listener of listeners) listener({ data });
    },
  };
}

function bridge() {
  const end = fakePort();
  const logged: string[] = [];
  const host = desktopUpdateHost({ port: end.port, version: '0.1.37', log: (line) => logged.push(line) });
  return { ...end, host, logged };
}

describe('desktop update bridge (spec 045)', () => {
  it('AC-1: is the desktop app at its stamped version, with nothing to do until the app says', () => {
    const { host } = bridge();
    expect(host).toMatchObject({
      kind: 'desktop',
      folder: null,
      running: { release: '0.1.37', commits: 0, commit: null },
    });
    expect(host.state()).toEqual({ action: 'none', update: { state: 'idle' } });
  });

  it("AC-18, AC-21, AC-23: takes the app's state as it comes, and says it changed", () => {
    const { host, tell } = bridge();
    let changes = 0;
    host.watch(() => {
      changes += 1;
    });
    tell({ type: 'update-state', action: 'none', update: { state: 'downloading', version: '0.1.40' } });
    expect(host.state()).toEqual({ action: 'none', update: { state: 'downloading', version: '0.1.40' } });
    tell({ type: 'update-state', action: 'download', update: { state: 'idle' } });
    expect(host.state().action).toBe('download');
    tell({ type: 'update-state', action: 'update', update: { state: 'failed', log: null } });
    expect(host.state().update).toEqual({ state: 'failed', log: null });
    expect(changes).toBe(3);
  });

  it('AC-20: Update asks the app to download that version, and says it is downloading at once', () => {
    const { host, sent } = bridge();
    void host.update('0.1.40');
    expect(sent).toEqual([{ type: 'download', version: '0.1.40' }]);
    expect(host.state().update).toEqual({ state: 'downloading', version: '0.1.40' });
  });

  it('AC-19: Restart to update asks the app to restart', () => {
    const { host, sent } = bridge();
    void host.restart();
    expect(sent).toEqual([{ type: 'restart' }]);
  });

  it("logs and leaves out a message it can't read", () => {
    const { host, tell, logged } = bridge();
    tell({ type: 'update-state', action: 'install-now', update: { state: 'idle' } });
    tell('hello');
    expect(host.state()).toEqual({ action: 'none', update: { state: 'idle' } });
    expect(logged).toEqual([
      "Orynx couldn't read a message from the desktop app's updater.",
      "Orynx couldn't read a message from the desktop app's updater.",
    ]);
  });

  it("keeps the desktop app's copy of the messages the same as the hub's", () => {
    expect(z.toJSONSchema(UpdateStateSchema)).toEqual(z.toJSONSchema(DesktopUpdateStateSchema));
    expect(z.toJSONSchema(UpdateCommandSchema)).toEqual(z.toJSONSchema(HubUpdateCommandSchema));
  });
});
