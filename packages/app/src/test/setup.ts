import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { useComposerStore } from '../features/home/store.ts';
import { useTestPopUpStore } from '../features/notifications/store.ts';
import { useSearchStore } from '../features/search/store.ts';
import { useDiffView, usePullRequestDrafts, useSessionDrafts, useTerminalTabs } from '../features/sessions/store.ts';
import { useTicketsStore } from '../features/tickets/store.ts';
import { useTicketDialogStore } from '../features/tickets/ticket-dialog-store.ts';
import { useConnectionStore } from '../stores/connection-store.ts';
import { useRecentSearches } from '../stores/recent-searches.ts';
import { useThemeStore } from '../stores/theme-store.ts';
import { useUiStore } from '../stores/ui-store.ts';
import { FakeEventSource } from './fake-event-source.ts';
import { FakeIntersectionObserver } from './fake-intersection-observer.ts';
import { server } from './msw.ts';

// jsdom has no scrolling; a stand-in lets parts that scroll a focused item into view run (as @devhub/ui's tests do).
if (!('scrollIntoView' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: () => undefined });
}

// jsdom has no pointer capture; Radix Select asks for it when it opens under the pointer.
if (!('hasPointerCapture' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'hasPointerCapture', { configurable: true, value: () => false });
  Object.defineProperty(Element.prototype, 'releasePointerCapture', { configurable: true, value: () => undefined });
}

// jsdom has no layout, so nothing resizes; a stand-in that never reports lets parts that watch their size run.
if (typeof window.ResizeObserver !== 'function') {
  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    },
  });
}

// jsdom has no layout, so nothing scrolls into view; tests say when it does (FakeIntersectionObserver.scrollIntoView).
Object.defineProperty(window, 'IntersectionObserver', { configurable: true, value: FakeIntersectionObserver });

// jsdom has no media queries; a stand-in reports a wide window, and a test of a narrow one stubs it.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      // The older names, which xterm still uses.
      addListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
}

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});

afterEach(() => {
  cleanup();
  // A stubbed matchMedia (a narrow window) or Notification would otherwise reach every test after it (spec 049).
  vi.unstubAllGlobals();
  server.resetHandlers();
  localStorage.clear();
  delete document.documentElement.dataset['theme'];
  useUiStore.setState(useUiStore.getInitialState());
  useThemeStore.setState(useThemeStore.getInitialState());
  useConnectionStore.setState(useConnectionStore.getInitialState());
  useTicketsStore.setState(useTicketsStore.getInitialState());
  useSearchStore.setState(useSearchStore.getInitialState());
  useComposerStore.setState(useComposerStore.getInitialState());
  useTicketDialogStore.setState(useTicketDialogStore.getInitialState());
  useTestPopUpStore.setState(useTestPopUpStore.getInitialState());
  useTerminalTabs.setState(useTerminalTabs.getInitialState());
  useDiffView.setState(useDiffView.getInitialState());
  useSessionDrafts.setState(useSessionDrafts.getInitialState());
  usePullRequestDrafts.setState(usePullRequestDrafts.getInitialState());
  useRecentSearches.setState(useRecentSearches.getInitialState());
  FakeEventSource.instances = [];
  FakeIntersectionObserver.instances = [];
});

afterAll(() => {
  server.close();
});
