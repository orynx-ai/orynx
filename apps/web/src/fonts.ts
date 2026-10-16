/** Every face `@devhub/ui` bundles (packages/ui/src/styles/index.css), as `document.fonts.load()` names them. */
export const bundledFaces = [
  '400 14px Geist',
  '500 14px Geist',
  '600 14px Geist',
  '400 12px "Geist Mono"',
  '500 12px "Geist Mono"',
  '400 32px Newsreader',
];

/**
 * Waits briefly for the bundled fonts so the first render already uses them. Without this,
 * the page is laid out in the fallback fonts and text moves when they swap in (a layout
 * shift; the Home greeting drops 2 px). The fonts come from this computer, so this takes
 * milliseconds; after `timeoutMs`, or if a font fails, the app renders anyway.
 */
export async function waitForFonts(fonts: Pick<FontFaceSet, 'load'> | undefined, timeoutMs = 300): Promise<void> {
  if (fonts === undefined) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled(bundledFaces.map((face) => fonts.load(face))),
    new Promise((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  clearTimeout(timer);
}
