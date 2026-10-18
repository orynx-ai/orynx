/**
 * jsdom lays nothing out, so nothing in it ever changes size. This stand-in for the browser's
 * `ResizeObserver` lets a test say when something did, as a narrower window would.
 */
export class FakeResizeObserver {
  static readonly instances = new Set<FakeResizeObserver>();
  private readonly watched = new Set<Element>();

  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element) {
    this.watched.add(target);
    FakeResizeObserver.instances.add(this);
  }

  unobserve(target: Element) {
    this.watched.delete(target);
  }

  disconnect() {
    this.watched.clear();
    FakeResizeObserver.instances.delete(this);
  }

  /** Tells every observer watching `target` that it changed size. */
  static resize(target: Element) {
    for (const observer of FakeResizeObserver.instances) {
      if (observer.watched.has(target)) observer.callback([], observer);
    }
  }
}
