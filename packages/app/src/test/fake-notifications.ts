/**
 * jsdom has neither the Notification API nor Web Locks; these browser-API stand-ins record what a tab asked the
 * browser for (spec 029). They fake the browser, not our code.
 */
export class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static shown: FakeNotification[] = [];
  static requestPermission = (): Promise<NotificationPermission> => Promise.resolve(FakeNotification.permission);

  readonly title: string;
  readonly options: NotificationOptions;
  onclick: (() => void) | null = null;
  closed = false;

  constructor(title: string, options: NotificationOptions = {}) {
    this.title = title;
    this.options = options;
    FakeNotification.shown.push(this);
  }

  close(): void {
    this.closed = true;
  }

  static reset(): void {
    FakeNotification.permission = 'granted';
    FakeNotification.shown = [];
  }
}

type LockCallback = () => Promise<unknown>;

/** Web Locks for one origin: a lock goes to the first to ask, and the next in line gets it when it's let go. */
export class FakeLocks {
  readonly #held = new Set<string>();
  readonly #waiting = new Map<string, (() => void)[]>();

  request(name: string, ...rest: [LockCallback] | [{ signal?: AbortSignal }, LockCallback]): Promise<unknown> {
    const callback = rest.length === 1 ? rest[0] : rest[1];
    const signal = rest.length === 1 ? undefined : rest[0].signal;
    return new Promise((resolve, reject) => {
      const grant = () => {
        this.#held.add(name);
        void callback()
          .then(resolve, reject)
          .finally(() => {
            this.#held.delete(name);
            this.#waiting.get(name)?.shift()?.();
          });
      };
      if (!this.#held.has(name)) {
        grant();
        return;
      }
      const queue = this.#waiting.get(name) ?? [];
      queue.push(grant);
      this.#waiting.set(name, queue);
      signal?.addEventListener('abort', () => {
        queue.splice(queue.indexOf(grant), 1);
        reject(new DOMException('The lock request was aborted.', 'AbortError'));
      });
    });
  }

  query(): Promise<{ held: { name: string }[] }> {
    return Promise.resolve({ held: [...this.#held].map((name) => ({ name })) });
  }
}

/** Gives jsdom's navigator these locks until the returned function takes them away again. */
export function installLocks(locks: FakeLocks): () => void {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: locks });
  return () => {
    Reflect.deleteProperty(navigator, 'locks');
  };
}
