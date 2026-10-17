import { afterEach, describe, expect, it, vi } from 'vitest';
import { bundledFontFaces } from '@devhub/ui';
import { waitForFonts } from './fonts.ts';

/** jsdom has no FontFaceSet; this stands in for the browser API, not for our code. */
function fakeFonts(load: (face: string) => Promise<unknown>) {
  const asked: string[] = [];
  return {
    asked,
    fonts: {
      load: (face: string) => {
        asked.push(face);
        return load(face) as Promise<FontFace[]>;
      },
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('waitForFonts', () => {
  it('asks for every bundled face before the first render', async () => {
    const { fonts, asked } = fakeFonts(() => Promise.resolve([]));

    await waitForFonts(fonts);

    expect(asked).toEqual(bundledFontFaces);
    expect(bundledFontFaces).toContain('400 40px Newsreader');
  });

  it('renders anyway when a font takes longer than the limit', async () => {
    vi.useFakeTimers();
    const { fonts } = fakeFonts(() => new Promise(() => undefined));
    let done = false;

    const waiting = waitForFonts(fonts, 300).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(299);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waiting;

    expect(done).toBe(true);
  });

  it('renders anyway when a font fails to load', async () => {
    const { fonts } = fakeFonts((face) =>
      face.includes('Newsreader') ? Promise.reject(new Error('404')) : Promise.resolve([]),
    );

    await expect(waitForFonts(fonts)).resolves.toBeUndefined();
  });

  it('does nothing where the browser has no font loading API', async () => {
    await expect(waitForFonts(undefined)).resolves.toBeUndefined();
  });
});
