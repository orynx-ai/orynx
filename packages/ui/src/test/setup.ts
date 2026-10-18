import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { FakeResizeObserver } from './fake-resize-observer.ts';

afterEach(() => {
  cleanup();
});

// jsdom has no layout, so no ResizeObserver; the stand-in lets a test say when something changed size.
if (typeof window.ResizeObserver !== 'function') {
  Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: FakeResizeObserver });
}

// jsdom has no scrolling; a stand-in lets parts that scroll a focused item into view run.
if (!('scrollIntoView' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: () => undefined });
}
