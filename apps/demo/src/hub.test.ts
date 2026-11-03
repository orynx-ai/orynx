import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, subscribeToEvents, type ApiClient } from '@devhub/api-client';
import type { ServerEvent } from '@devhub/contracts';
import { createHub, pace, type Hub } from './hub.ts';
import { ids } from './world.ts';

// The real api-client against the hub, so every answer is parsed by the schemas the app parses it with.
const baseURL = 'http://localhost:4320';
const server = setupServer();
let hub: Hub;
let api: ApiClient;
const steps = (count: number) => vi.advanceTimersByTimeAsync(count * pace);

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  hub = createHub();
  server.resetHandlers(...hub.handlers);
  api = createApiClient({ baseURL, token: 'demo', EventSource: hub.EventSource });
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(() => {
  server.close();
});

describe('the demo hub', () => {
  it('serves Acme’s world: sessions, inbox, sprint and settings all read as the app reads them', async () => {
    const { sessions } = await api.sessions();
    expect(sessions.map((session) => session.title)).toContain('Show a delivery estimate on checkout');
    for (const { id } of sessions) await expect(api.session(id)).resolves.toMatchObject({ id });
    const [inbox, tickets, status, preferences] = await Promise.all([
      api.inbox(),
      api.tickets(),
      api.status(),
      api.preferences(),
    ]);
    expect(inbox.items.length).toBeGreaterThan(5);
    expect(tickets.tickets.find((ticket) => ticket.key === 'SHOP-482')?.session).toMatchObject({
      id: ids.csv,
      state: 'needs_you',
    });
    expect(status.integrations.jira.state).toBe('connected');
    expect(preferences.allowedCommands).toEqual(['pnpm lint']);
  });

  it('plays a ticket from Ship to an open pull request, telling the page each change as it goes', async () => {
    const events: ServerEvent[] = [];
    const close = subscribeToEvents({
      baseURL,
      token: 'demo',
      EventSource: hub.EventSource,
      onEvent: (event) => events.push(event),
    });

    const started = await api.startSession({ ticketKey: 'SHOP-491' });
    if (started.result !== 'started') throw new Error(`Expected a new session, got ${started.result}`);
    const { sessionId } = started;
    await expect(api.startSession({ ticketKey: 'SHOP-491' })).resolves.toEqual({ result: 'existing', sessionId });
    expect((await api.tickets()).tickets.find((ticket) => ticket.key === 'SHOP-491')).toMatchObject({
      column: 'in_progress',
    });

    await steps(4);
    const waiting = await api.session(sessionId);
    expect(waiting).toMatchObject({ state: 'needs_you', step: 'test' });
    expect(waiting.activities.map((activity) => activity.kind)).toEqual(['explore', 'plan', 'edit', 'waiting']);
    const [approval] = waiting.approvals;
    expect(approval).toMatchObject({ kind: 'command', command: 'pnpm test' });
    expect((await api.sessionChanges(sessionId)).state).toBe('ready');

    await api.respondToApproval(sessionId, approval?.id ?? '', 'allow_once');
    expect(await api.session(sessionId)).toMatchObject({ state: 'working', approvals: [] });
    await steps(1);
    const done = await api.session(sessionId);
    expect(done).toMatchObject({ state: 'done', ready: 'pull_request', runStartedAt: null });
    expect(done.activities.at(-1)).toMatchObject({ kind: 'finished' });
    expect((await api.notifications()).unread).toBe(2);

    const draft = await api.draftPullRequest(sessionId);
    expect(draft).toMatchObject({ result: 'draft', title: 'SHOP-491: Coupon codes are case sensitive at checkout' });
    const opened = await api.createPullRequest(sessionId, { title: 'SHOP-491: Fix coupon case', body: '' });
    expect(opened).toMatchObject({ result: 'opened', linked: false });
    expect(await api.session(sessionId)).toMatchObject({
      state: 'pr_open',
      pullRequest: { title: 'SHOP-491: Fix coupon case' },
    });
    expect((await api.tickets()).tickets.find((ticket) => ticket.key === 'SHOP-491')).toMatchObject({
      column: 'in_review',
      session: { id: sessionId, state: 'pr_open' },
    });

    expect(events).toContainEqual({ type: 'session.changed', sessionId });
    close();
  });

  it('takes your answer to Claude’s question, then finishes', async () => {
    await api.respondToApproval(ids.delivery, 'q1', { answers: [{ picked: ['Zone table'], other: null }] });
    expect((await api.session(ids.delivery)).activities.at(-1)).toMatchObject({
      kind: 'answered',
      answers: [{ header: 'Source', answer: 'Zone table' }],
    });
    await expect(
      api.respondToApproval(ids.delivery, 'q1', { answers: [{ picked: ['Zone table'], other: null }] }),
    ).rejects.toMatchObject({
      code: 'already_answered',
    });
    await steps(2);
    expect(await api.session(ids.delivery)).toMatchObject({ state: 'done', ready: 'pull_request' });
  });

  it('answers an Ask from the composer, and stops a Build when you press Stop', async () => {
    const ask = await api.startSession({ message: 'Why is checkout slow?', context: [], mode: 'ask' });
    if (ask.result !== 'started') throw new Error('Expected a new Ask');
    await steps(1.5);
    expect(await api.session(ask.sessionId)).toMatchObject({ state: 'done', ready: 'nothing', branch: null });

    const build = await api.startSession({ message: 'Add a dark mode toggle', context: [] });
    if (build.result !== 'started') throw new Error('Expected a new Build');
    await api.stopSession(build.sessionId);
    await steps(4);
    expect(await api.session(build.sessionId)).toMatchObject({ state: 'stopped', approvals: [] });
  });

  it('keeps what you change in Settings and on Claude’s review, and says no to what a demo can’t do', async () => {
    await api.changePreferences({ allowCommand: 'pnpm build' });
    expect((await api.preferences()).allowedCommands).toEqual(['pnpm lint', 'pnpm build']);

    await api.changeReviewComment(ids.review, 'r3', { keep: true });
    await expect(
      api.postReview(ids.review, { summary: 'Two fixes first.', verdict: 'request_changes' }),
    ).resolves.toMatchObject({
      result: 'posted',
      comments: 3,
    });

    await expect(api.disconnectJira()).rejects.toMatchObject({ status: 400 });
  });

  it('runs a follow-up, then pushes it to the pull request', async () => {
    await expect(api.draftPush(ids.audit)).resolves.toEqual({ result: 'nothing_new' });
    await expect(api.sendMessage(ids.audit, { text: 'Cap the limit at 100' })).resolves.toEqual({ result: 'sent' });
    expect(await api.session(ids.audit)).toMatchObject({ state: 'working' });
    await steps(2);
    expect(await api.session(ids.audit)).toMatchObject({ state: 'pr_open', unpushed: true });
    await expect(api.draftPush(ids.audit)).resolves.toMatchObject({ result: 'draft', number: 322 });
    await expect(api.pushChanges(ids.audit, 'Cap the limit at 100')).resolves.toEqual({ result: 'pushed', files: 2 });
    expect(await api.session(ids.audit)).toMatchObject({ unpushed: false });
    await expect(api.pushChanges(ids.search, 'Nothing')).resolves.toEqual({ result: 'nothing_new' });
  });

  it('skips Claude’s question or denies a command, and Claude finishes without it', async () => {
    await api.respondToApproval(ids.delivery, 'q1', 'deny');
    await api.respondToApproval(ids.csv, 'a1', 'always_allow');
    expect((await api.session(ids.delivery)).activities.at(-1)).toMatchObject({ kind: 'denied', about: 'question' });
    expect((await api.preferences()).allowedCommands).toContain('pnpm test -- orders');
    await steps(1);
    expect(await api.session(ids.delivery)).toMatchObject({ state: 'done' });
    expect(await api.session(ids.csv)).toMatchObject({ state: 'done', ready: 'pull_request' });
  });

  it('renames, pins, discards and deletes sessions', async () => {
    await api.changeSession(ids.search, { title: 'Slow search, page 2', pinned: true });
    const pinned = await api.sessions({ pinned: true });
    expect(pinned.sessions.map((session) => session.title)).toEqual(['Slow search, page 2']);
    expect((await api.sessions({ pinned: false })).sessions).toHaveLength(5);

    await api.discardSession(ids.csv);
    expect(await api.session(ids.csv)).toMatchObject({ state: 'stopped', followUp: { kind: 'discarded' } });
    await api.deleteSession(ids.csv);
    await expect(api.session(ids.csv)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('answers every read a screen makes, and keeps the notifications, profile and inbox you change', async () => {
    await Promise.all([
      api.setup(),
      api.storage(),
      api.repositories(),
      api.jiraConnection(),
      api.githubConnection(),
      api.slackConnection(),
      api.discordConnection(),
      api.claudeLogin(),
      api.codexLogin(),
      api.agentModels('codex'),
      api.agentsAccess(),
      api.orynxSkills(),
      api.skills(null),
      api.updates(),
      api.syncActivity({}),
      api.jiraProjects(),
      api.jiraTicketTypes('SHOP'),
      api.ticketsSprints('SHOP'),
      api.reviewStatus(ids.review),
      api.sessionCommands(ids.csv),
      api.sessionPorts(ids.csv),
      api.terminal(ids.csv),
      api.sessionDiff(ids.csv, 'src/lib/csv.ts'),
    ]);
    await expect(api.agentModels('claude')).resolves.toMatchObject({ state: 'ready' });
    await expect(api.sessionDiff(ids.csv, 'src/orders/OrdersReport.tsx')).resolves.toMatchObject({
      path: 'src/orders/OrdersReport.tsx',
    });
    await expect(api.ticket('SHOP-476')).resolves.toMatchObject({
      result: 'found',
      ticket: { session: { id: ids.delivery } },
    });
    await expect(api.ticket('SHOP-999')).resolves.toEqual({ result: 'not_found' });
    const index = await api.search();
    expect(index.pullRequests.map((pull) => pull.number)).toEqual([318, 1179, 1184]);

    await api.markNotificationsRead({ all: true });
    expect((await api.notifications()).unread).toBe(0);
    await api.changeNotificationSettings({ sounds: false, events: { session_finished: { popUp: false } } });
    expect(await api.notificationSettings()).toMatchObject({ sounds: false });
    await api.saveProfile({ ...(await api.profile()), bio: 'Checkout at Acme' });
    expect(await api.profile()).toMatchObject({ bio: 'Checkout at Acme' });
    const before = (await api.inbox()).syncedAt;
    await steps(1);
    await api.refreshInbox();
    expect((await api.inbox()).syncedAt).not.toBe(before);
  });
});
