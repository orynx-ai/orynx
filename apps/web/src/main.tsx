import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DevhubApp } from '@devhub/app';
import { waitForFonts } from './fonts.ts';
import { webPlatform } from './platform.ts';
import { readDevhubToken } from './token.ts';
import './styles.css';

// Lay out the first render in the real fonts, so nothing moves when they arrive.
await waitForFonts(document.fonts);

const root = document.getElementById('root');
if (root === null) throw new Error('index.html is missing <div id="root">.');

createRoot(root).render(
  <StrictMode>
    <DevhubApp server={{ baseURL: window.location.origin, token: readDevhubToken() }} platform={webPlatform} />
  </StrictMode>,
);
