import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setupWorker } from 'msw/browser';
import { createHashHistory, DevhubApp, type Platform } from '@devhub/app';
import { bundledFontFaces } from '@devhub/ui';
import { createHub } from './hub.ts';
import './styles.css';

const hub = createHub();
// The page answers its own /api calls, so the demo runs from any static host with no Orynx behind it.
await setupWorker(...hub.handlers).start({
  // Relative, so it registers in the demo's own folder wherever the site serves it.
  serviceWorker: { url: './mockServiceWorker.js' },
  onUnhandledFrame: 'bypass',
  quiet: true,
});
// Lay out the first render in the real fonts, so nothing moves when they arrive.
await Promise.allSettled(bundledFontFaces.map((face) => document.fonts.load(face)));

// The composer starts in storefront-web on Opus, unless this visitor picked something else already.
try {
  if (localStorage.getItem('devhub.home') === null)
    localStorage.setItem(
      'devhub.home',
      JSON.stringify({
        state: { lastUsed: '00000000000000aa', model: 'opus', effort: 'high', agent: 'claude', mode: 'build' },
        version: 0,
      }),
    );
} catch {
  // Storage is blocked: the composer asks for a folder instead.
}

const platform: Platform = {
  kind: 'web',
  os: /mac|iphone|ipad/i.test(navigator.platform) ? 'mac' : 'other',
  openExternal(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  },
  reload() {
    window.location.reload();
  },
};

const root = document.getElementById('root');
if (root === null) throw new Error('index.html is missing <div id="root">.');

createRoot(root).render(
  <StrictMode>
    <DevhubApp
      server={{ baseURL: window.location.origin, token: 'demo', EventSource: hub.EventSource }}
      platform={platform}
      history={createHashHistory()}
    />
  </StrictMode>,
);
