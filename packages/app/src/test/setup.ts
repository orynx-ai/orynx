import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { useConnectionStore } from '../stores/connection-store.ts';
import { useThemeStore } from '../stores/theme-store.ts';
import { useUiStore } from '../stores/ui-store.ts';
import { FakeEventSource } from './fake-event-source.ts';
import { server } from './msw.ts';

// jsdom does no layout, so it has no scrollIntoView: a browser scrolls there, here nothing moves.
Element.prototype.scrollIntoView = () => undefined;

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
  FakeEventSource.instances = [];
});

afterAll(() => {
  server.close();
});
