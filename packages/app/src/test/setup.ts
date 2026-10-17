import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { useTicketsStore } from '../features/tickets/store.ts';
import { useConnectionStore } from '../stores/connection-store.ts';
import { useThemeStore } from '../stores/theme-store.ts';
import { useUiStore } from '../stores/ui-store.ts';
import { FakeEventSource } from './fake-event-source.ts';
import { server } from './msw.ts';

// jsdom has no scrolling; a stand-in lets parts that scroll a focused item into view run (as @devhub/ui's tests do).
if (!('scrollIntoView' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: () => undefined });
}

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  delete document.documentElement.dataset['theme'];
  useUiStore.setState(useUiStore.getInitialState());
  useThemeStore.setState(useThemeStore.getInitialState());
  useConnectionStore.setState(useConnectionStore.getInitialState());
  useTicketsStore.setState(useTicketsStore.getInitialState());
  FakeEventSource.instances = [];
});

afterAll(() => {
  server.close();
});
