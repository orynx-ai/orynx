import { describe, expect, it } from 'vitest';
import { ApiErrorSchema } from './index.ts';

describe('ApiErrorSchema', () => {
  it("AC-6: accepts the error a route sends when the OS keychain can't be reached", () => {
    const body = {
      code: 'keychain_unavailable',
      message: "DevHub can't reach your OS keychain. Unlock it, or turn on the .env fallback (see .env.example).",
    };
    expect(ApiErrorSchema.parse(body)).toEqual(body);
  });

  it('rejects a code the server never sends', () => {
    expect(ApiErrorSchema.safeParse({ code: 'teapot', message: 'No.' }).success).toBe(false);
  });
});
