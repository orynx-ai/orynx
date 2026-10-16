import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from './event-bus.ts';

describe('createEventBus', () => {
  it('delivers a published event to every listener', () => {
    const bus = createEventBus();
    const first = vi.fn();
    const second = vi.fn();
    bus.subscribe(first);
    bus.subscribe(second);

    bus.publish({ type: 'status.changed' });

    expect(first).toHaveBeenCalledWith({ type: 'status.changed' });
    expect(second).toHaveBeenCalledWith({ type: 'status.changed' });
  });

  it('stops delivering after unsubscribe', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);

    unsubscribe();
    bus.publish({ type: 'status.changed' });

    expect(listener).not.toHaveBeenCalled();
    expect(bus.listenerCount()).toBe(0);
  });
});
