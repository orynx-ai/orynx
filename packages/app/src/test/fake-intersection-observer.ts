/**
 * jsdom does no layout, so nothing ever scrolls into view; test setup installs this browser-API stand-in.
 * It fakes the browser, not our code: a test says when an element is in view, and the real component reacts.
 */
export class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];

  readonly targets = new Set<Element>();
  readonly #callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.#callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Every watched element scrolls into view, as when the person scrolls a list to its end. */
  static scrollIntoView(): void {
    for (const observer of FakeIntersectionObserver.instances) {
      const entries = [...observer.targets].map(
        (target) => ({ target, isIntersecting: true, intersectionRatio: 1 }) as unknown as IntersectionObserverEntry,
      );
      if (entries.length > 0) observer.#callback(entries, observer as unknown as IntersectionObserver);
    }
  }
}
