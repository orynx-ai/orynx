import { describe, expect, it } from 'vitest';
import { ApiErrorSchema } from './index.ts';

describe('ApiErrorSchema', () => {
  it("AC-6: accepts the error a route sends when the OS keychain can't be reached", () => {
    const body = {
      code: 'keychain_unavailable',
      message: "Orynx can't reach your OS keychain. Unlock it, or turn on the .env fallback (see .env.example).",
    };
    expect(ApiErrorSchema.parse(body)).toEqual(body);
  });

  it('AC-4: accepts the error a route sends when Jira refuses the email and token', () => {
    const body = {
      code: 'integration_rejected',
      message: "Jira didn't accept this email and API token. Check both, or create a new token.",
    };
    expect(ApiErrorSchema.parse(body)).toEqual(body);
  });

  it("AC-5: accepts the error a route sends when Jira can't be reached", () => {
    const body = {
      code: 'integration_unreachable',
      message: "Can't reach your-team.atlassian.net. Check your network or VPN, then try again.",
    };
    expect(ApiErrorSchema.parse(body)).toEqual(body);
  });

  it('rejects a code the server never sends', () => {
    expect(ApiErrorSchema.safeParse({ code: 'teapot', message: 'No.' }).success).toBe(false);
  });
});
