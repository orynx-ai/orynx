import { describe, expect, it } from 'vitest';
import { ConnectionCheckSchema, IntegrationStatusSchema, ServerEventSchema, StatusSchema } from './index.ts';
import { makeStatus } from './testing.ts';

describe('StatusSchema', () => {
  it('accepts a status where nothing is connected yet', () => {
    expect(StatusSchema.safeParse(makeStatus()).success).toBe(true);
  });

  it('rejects an unknown connection state', () => {
    const status = makeStatus();
    const result = StatusSchema.safeParse({
      ...status,
      integrations: { ...status.integrations, jira: { state: 'maybe', detail: null } },
    });
    expect(result.success).toBe(false);
  });

  it('lets a builder override one integration and keeps the others not connected', () => {
    const status = makeStatus({
      integrations: { github: { state: 'connected', detail: 'Signed in with the gh command-line tool' } },
    });
    expect(status.integrations.github.state).toBe('connected');
    expect(status.integrations.jira.state).toBe('not_connected');
  });
});

describe('IntegrationStatusSchema (spec 030)', () => {
  it('AC-7: carries who Orynx is signed in as and when the tool was last asked, both optional', () => {
    const status = { state: 'connected', detail: 'Personal API token for x.atlassian.net' };
    expect(IntegrationStatusSchema.parse(status)).toEqual(status);
    const full = { ...status, account: 'me@example.com', checkedAt: '2026-10-20T08:00:00.000Z' };
    expect(IntegrationStatusSchema.parse(full)).toEqual(full);
    expect(IntegrationStatusSchema.safeParse({ ...status, checkedAt: 'two minutes ago' }).success).toBe(false);
  });
});

describe('ConnectionCheckSchema', () => {
  it('AC-8: is the fresh status and how long the tool took, in whole milliseconds', () => {
    const check = { status: { state: 'connected', detail: null }, ms: 180 };
    expect(ConnectionCheckSchema.parse(check)).toEqual(check);
    expect(ConnectionCheckSchema.safeParse({ ...check, ms: 1.5 }).success).toBe(false);
    expect(ConnectionCheckSchema.safeParse({ ...check, ms: -1 }).success).toBe(false);
  });
});

describe('ServerEventSchema', () => {
  it('accepts the hello event with an ISO time', () => {
    expect(ServerEventSchema.parse({ type: 'hello', at: '2026-10-16T10:00:00.000Z' })).toEqual({
      type: 'hello',
      at: '2026-10-16T10:00:00.000Z',
    });
  });

  it('rejects an event type the client does not know', () => {
    expect(ServerEventSchema.safeParse({ type: 'session.exploded' }).success).toBe(false);
  });
});

describe('StatusSchema user', () => {
  it('AC-16: rejects a name with nothing visible in it', () => {
    expect(StatusSchema.safeParse({ ...makeStatus(), user: { name: '   ' } }).success).toBe(false);
  });

  it('AC-16: carries the name DevHub knows, or null', () => {
    expect(StatusSchema.parse(makeStatus({ user: { name: 'Rakesh Dhariwal' } })).user.name).toBe('Rakesh Dhariwal');
    expect(makeStatus().user.name).toBeNull();
  });
});
