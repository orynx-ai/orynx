import { describe, expect, it } from 'vitest';
import { sizeText } from './size.ts';

describe('sizeText (spec 047, D)', () => {
  it('says a size as Finder does, in thousands: one decimal under 10, whole numbers above', () => {
    expect(sizeText(0)).toBe('0 B');
    expect(sizeText(512)).toBe('512 B');
    expect(sizeText(1_500)).toBe('1.5 KB');
    expect(sizeText(850_000_000)).toBe('850 MB');
    expect(sizeText(4_100_000_000)).toBe('4.1 GB');
    expect(sizeText(12_400_000_000)).toBe('12 GB');
    expect(sizeText(999_700)).toBe('1.0 MB');
  });
});
