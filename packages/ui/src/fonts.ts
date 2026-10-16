/**
 * Every face `styles/index.css` bundles from @fontsource, as `document.fonts.load()` names them.
 * Hosts wait for these before the first render so text never moves when a font swaps in.
 * Keep it in step with the @fontsource imports in `styles/index.css`.
 */
export const bundledFontFaces: readonly string[] = [
  '400 14px Geist',
  '500 14px Geist',
  '600 14px Geist',
  '400 12px "Geist Mono"',
  '500 12px "Geist Mono"',
  '400 32px Newsreader',
];
