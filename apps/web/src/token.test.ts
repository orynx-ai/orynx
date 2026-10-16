import { describe, expect, it } from 'vitest';
import { readDevhubToken } from './token.ts';

function page(head: string): Document {
  return new DOMParser().parseFromString(`<html><head>${head}</head><body></body></html>`, 'text/html');
}

describe('readDevhubToken', () => {
  it('reads the token the server injected', () => {
    expect(readDevhubToken(page('<meta name="devhub-token" content="abc123" />'))).toBe('abc123');
  });

  it('returns an empty token when the page has none, so the API answers 401 and the app asks to reload', () => {
    expect(readDevhubToken(page(''))).toBe('');
  });
});
