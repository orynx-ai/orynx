import { http, HttpResponse, type HttpHandler, type JsonBodyType, type PathParams } from 'msw';
import {
  apiRoutes,
  CreatePullRequestRequestSchema,
  defaultNotificationSettings,
  MarkNotificationsReadSchema,
  NotificationSettingsChangeSchema,
  NotificationSettingsSchema,
  PostReviewRequestSchema,
  PreferencesChangeSchema,
  PreferencesSchema,
  ProfileSchema,
  RespondToApprovalRequestSchema,
  ReviewCommentChangeSchema,
  SendMessageRequestSchema,
  SessionChangeRequestSchema,
  SessionSchema,
  SessionSummarySchema,
  StartSessionRequestSchema,
  type ComposerChip,
  type ServerEvent,
  type Session,
  type SessionActivity,
  type Ticket,
} from '@devhub/contracts';
import * as f from '@devhub/contracts/testing';
import type { EventSourceConstructor, EventSourceLike } from '@devhub/api-client';
import { buildSteps, createWorld, folderOf, storefront } from './world.ts';

/** How long each of Claude's made-up steps takes, in ms: quick enough to watch, slow enough to follow. */
export const pace = 2500;

export interface Hub {
  /** Every /api call the app makes, answered from the made-up world. */
  handlers: HttpHandler[];
  /** The hub's event stream, so the app refetches what an action changed, as with the real hub. */
  EventSource: EventSourceConstructor;
}

/** An activity as Claude's side writes it: the hub gives it its id, state and time. */
type ActivityInput = SessionActivity extends infer A
  ? A extends unknown
    ? Omit<A, 'id' | 'state' | 'at'>
    : never
  : never;

/**
 * A stand-in for the local hub that lives in the page: it keeps Acme's world in memory, changes it as you click, and
 * plays Claude's side of a session on timers. A reload starts the demo over.
 */
export function createHub(): Hub {
  const world = createWorld(Date.now());
  const { sessions, changes, diffs, repositories } = world;
  let { inbox, notifications } = world;
  let preferences = f.makePreferences({
    permissions: { edits: 'allow', commands: 'allowed_list', network: 'ask', push: 'ask', pullRequest: 'ask' },
    allowedCommands: ['pnpm lint'],
  });
  let notificationSettings = defaultNotificationSettings;
  let profile = f.makeProfile({ name: 'Alex Morgan', bio: 'Frontend at Acme' });
  let serial = 0;
  const nextId = () => `demo${String(++serial)}`;
  const iso = () => new Date().toISOString();

  // ---------- Events ----------
  const listeners = new Set<(event: ServerEvent) => void>();
  const emit = (...events: ServerEvent[]) => {
    for (const event of events) for (const listener of listeners) listener(event);
  };
  class DemoEventSource implements EventSourceLike {
    onmessage: EventSourceLike['onmessage'] = null;
    onerror: EventSourceLike['onerror'] = null;
    onopen: EventSourceLike['onopen'] = null;
    readonly #listener = (event: ServerEvent) => {
      this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(event) }));
    };
    constructor(url: string) {
      // Only the hub's own stream: a shell tab's output (spec 038) stays quiet.
      if (new URL(url).pathname === apiRoutes.events) listeners.add(this.#listener);
    }
    close() {
      listeners.delete(this.#listener);
    }
  }

  // ---------- Sessions ----------
  const timers = new Map<string, ReturnType<typeof setTimeout>[]>();
  const later = (id: string, steps: number, run: () => void) => {
    timers.set(id, [...(timers.get(id) ?? []), setTimeout(run, steps * pace)]);
  };
  const stopTimers = (id: string) => {
    for (const timer of timers.get(id) ?? []) clearTimeout(timer);
    timers.delete(id);
  };
  const find = (id: string) => sessions.find((session) => session.id === id);

  function change(id: string, next: (session: Session) => Partial<Session>) {
    const at = sessions.findIndex((session) => session.id === id);
    const session = sessions[at];
    if (session === undefined) return;
    sessions[at] = SessionSchema.parse({ ...session, ...next(session), updatedAt: iso() });
    emit({ type: 'session.changed', sessionId: id }, { type: 'sessions.changed' }, { type: 'tickets.changed' });
  }
  /** Ends whatever is running and adds `activity` as the one that runs now (or is done, when `done`). */
  function add(id: string, activity: ActivityInput, extra: Partial<Session> = {}, done = false) {
    change(id, (session) => ({
      ...extra,
      activities: [
        ...session.activities.map((old) => ({ ...old, state: 'done' as const })),
        {
          ...activity,
          id: nextId(),
          state: done ? 'done' : 'running',
          step: extra.step ?? session.step,
          at: iso(),
        },
      ],
    }));
  }

  function filesFor(session: Session): string[] {
    const known = changes.get(session.id);
    if (known?.state === 'ready' && known.files.length > 0) return known.files.map((file) => file.path);
    // Two words of four letters or more: "Save the shopper's last shipping address" makes src/save-shopper.ts.
    const words = session.title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3);
    const slug = words.slice(0, 2).join('-') || 'change';
    return [`src/${slug}.ts`, `src/${slug}.test.ts`];
  }
  /** Claude's made-up change: a small new file and its test, unless the world already has its changes. */
  function makeChanges(session: Session) {
    if (changes.has(session.id)) return;
    const [path = 'src/change.ts', testPath = 'src/change.test.ts'] = filesFor(session);
    changes.set(
      session.id,
      f.makeSessionChanges({
        files: [
          f.makeChangedFile({ path, added: 24, removed: 0 }),
          f.makeChangedFile({ path: testPath, added: 31, removed: 0 }),
        ],
        added: 55,
        removed: 0,
      }),
    );
    diffs.set(
      session.id,
      f.makeFileDiff({
        path,
        lines: [
          { kind: 'hunk', text: '@@ -0,0 +1,6 @@' },
          { kind: 'added', number: 1, text: `// ${session.title}` },
          { kind: 'added', number: 2, text: 'export function apply(input: Input): Output {' },
          { kind: 'added', number: 3, text: '  const checked = validate(input);' },
          { kind: 'added', number: 4, text: '  return toOutput(checked);' },
          { kind: 'added', number: 5, text: '}' },
        ],
      }),
    );
    emit({ type: 'session.files.changed', sessionId: session.id });
  }

  function notify(session: Session) {
    notifications = [
      f.makeNotification({
        id: nextId(),
        at: iso(),
        what: {
          kind: 'session_finished',
          session: { id: session.id, title: session.title, source: session.source },
        } as never,
      }),
      ...notifications,
    ];
    emit({ type: 'notifications.changed' });
  }

  function finish(id: string) {
    const session = find(id);
    if (session === undefined) return;
    const edited = session.mode === 'build';
    const summary = edited
      ? `Made the change in ${String(filesFor(session).length)} files and the tests pass. Look at Changes, then open the pull request.`
      : `In the real app, Claude’s answer to “${session.title}” goes here, with the files it read.`;
    stopTimers(id);
    // Claude ticks off its to-dos as it finishes (spec 046).
    change(id, (now) => ({
      activities: now.activities.map((activity) =>
        activity.kind === 'plan' ? { ...activity, statuses: activity.items.map(() => 'completed' as const) } : activity,
      ),
    }));
    add(
      id,
      { kind: 'finished', summary },
      {
        state: session.pullRequest === null ? 'done' : 'pr_open',
        ready: !edited ? 'nothing' : session.workOn === 'pull_request' ? 'push' : 'pull_request',
        endedAt: iso(),
        workedMs: session.workedMs + Date.now() - Date.parse(session.runStartedAt ?? iso()),
        runStartedAt: null,
        unpushed: edited,
      },
      true,
    );
    const finished = find(id);
    if (finished !== undefined) notify(finished);
  }

  /** Claude's side of a new session: read, plan, edit, then ask to run the tests. An Ask reads, then answers. */
  function run(id: string) {
    const session = find(id);
    if (session === undefined) return;
    const files = filesFor(session);
    add(id, { kind: 'explore', files });
    if (session.mode === 'ask') {
      later(id, 1.5, () => {
        finish(id);
      });
      return;
    }
    later(id, 1, () => {
      add(id, {
        kind: 'plan',
        items: ['Read how it works today', 'Make the change', 'Cover it with a test', 'Run the tests'],
        statuses: ['completed', 'in_progress', 'pending', 'pending'],
      });
    });
    later(id, 2, () => {
      add(id, { kind: 'edit', files }, { step: 'build' });
      const now = find(id);
      if (now !== undefined) makeChanges(now);
    });
    later(id, 3.5, () => {
      const approvalId = nextId();
      add(
        id,
        { kind: 'waiting', approvalId, about: 'command', text: 'Run the tests' },
        {
          step: 'test',
          state: 'needs_you',
          changed: true,
          approvals: [
            f.makeSessionApproval({
              id: approvalId,
              command: 'pnpm test',
              description: 'Run the tests',
              alwaysAllow: 'pnpm test',
              askedAt: iso(),
            }),
          ],
        },
      );
    });
  }

  function answer(id: string, approvalId: string, body: unknown) {
    const session = find(id);
    const approval = session?.approvals.find((one) => one.id === approvalId);
    if (session === undefined || approval === undefined)
      return HttpResponse.json({ code: 'already_answered', message: 'This was answered already.' }, { status: 409 });
    const request = RespondToApprovalRequestSchema.parse(body);
    const resumed = {
      state: 'working' as const,
      approvals: session.approvals.filter((one) => one !== approval),
      runStartedAt: session.runStartedAt ?? iso(),
    };
    if (request.decision === 'answer' && approval.kind === 'question') {
      const answers = approval.questions.map((question, at) => {
        const given = request.answers[at];
        const picked = given !== undefined && given.picked.length > 0 ? given.picked.join(', ') : 'Skipped';
        return { header: question.header, answer: given?.other ?? picked };
      });
      add(id, { kind: 'answered', answers }, resumed, true);
      later(id, 1, () => {
        add(id, { kind: 'edit', files: filesFor(session) }, { step: 'build' });
      });
      later(id, 2, () => {
        finish(id);
      });
    } else if (request.decision === 'deny') {
      const text =
        approval.kind === 'question'
          ? (approval.questions[0]?.question ?? 'Question')
          : approval.kind === 'command'
            ? approval.command
            : approval.id;
      add(id, { kind: 'denied', about: approval.kind, text }, resumed, true);
      later(id, 1, () => {
        finish(id);
      });
    } else {
      const command = approval.kind === 'command' ? approval.command : 'pnpm test';
      if (request.decision === 'always_allow')
        preferences = { ...preferences, allowedCommands: [...preferences.allowedCommands, command] };
      add(id, { kind: 'command', commands: [command], calls: [{ id: nextId(), failed: null }] }, resumed);
      later(id, 1, () => {
        change(id, (now) => ({
          activities: now.activities.map((activity) =>
            activity.kind === 'command'
              ? { ...activity, calls: activity.calls?.map((call) => ({ ...call, failed: false })) }
              : activity,
          ),
        }));
        finish(id);
      });
    }
    return new HttpResponse(null, { status: 204 });
  }

  function start(body: unknown) {
    const request = StartSessionRequestSchema.parse(body);
    const chips: ComposerChip[] = 'ticketKey' in request ? [{ kind: 'jira', key: request.ticketKey }] : request.context;
    const key = chips.find((chip) => chip.kind === 'jira')?.key;
    const ticket = world.tickets.find((one) => one.key === key);
    const live = key === undefined ? undefined : liveSession(key);
    if (live !== undefined && !('another' in request && request.another === true))
      return { result: 'existing' as const, sessionId: live.id };
    const pull = chips.find((chip) => chip.kind === 'pull_request');
    const message = 'message' in request ? request.message : '';
    const mode = ('mode' in request ? request.mode : undefined) ?? 'build';
    const repository =
      repositories.find((one) => one.id === request.repositoryId) ??
      repositories.find((one) => key?.startsWith(`${String(one.jiraProject)}-`)) ??
      storefront;
    const firstLine = message.split('\n')[0]?.slice(0, 80) ?? '';
    const title =
      ticket?.title ?? (firstLine !== '' ? firstLine : pull ? `Review #${String(pull.number)}` : 'New session');
    const id = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const now = iso();
    sessions.unshift(
      f.makeSession({
        id,
        title,
        state: 'working',
        source: key !== undefined ? { kind: 'jira', key } : pull ? { kind: 'pull_request', number: pull.number } : null,
        updatedAt: now,
        mode,
        agent: request.agent ?? 'claude',
        folder: folderOf(repository),
        branch:
          mode === 'ask'
            ? null
            : `feat/${
                key ??
                title
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .slice(0, 30)
              }`,
        step: mode === 'ask' ? 'answer' : 'plan',
        steps: mode === 'ask' ? [] : buildSteps,
        intent: mode === 'ask' ? null : 'change',
        startedAt: now,
        runStartedAt: now,
        jiraUrl: ticket ? ticket.url : null,
        sprint: ticket ? 'Sprint 18' : null,
        ticket: ticket
          ? f.makeSessionTicket({
              type: ticket.type,
              description: `${ticket.title}.`,
              status: { name: 'In Progress', column: 'in_progress' },
              dueDate: ticket.dueDate,
            })
          : null,
        context: chips,
        worktreePath: mode === 'ask' ? null : `/Users/alex/.devhub/worktrees/${id}`,
      }),
    );
    if (ticket !== undefined) moveTicket(ticket.key, 'in_progress', 'In Progress');
    run(id);
    return { result: 'started' as const, sessionId: id };
  }

  // ---------- Tickets ----------
  function liveSession(key: string) {
    return sessions.find(
      (session) =>
        session.source?.kind === 'jira' &&
        session.source.key === key &&
        session.state !== 'stopped' &&
        session.discardedAt === null,
    );
  }
  function withSession(ticket: Ticket): Ticket {
    const session = liveSession(ticket.key);
    return {
      ...ticket,
      session:
        session && session.state !== 'stopped' ? { id: session.id, state: session.state, ready: session.ready } : null,
    };
  }
  function moveTicket(key: string, column: Ticket['column'], status: string) {
    world.tickets = world.tickets.map((ticket) => (ticket.key === key ? { ...ticket, column, status } : ticket));
    emit({ type: 'tickets.changed' }, { type: 'inbox.changed' });
  }

  // ---------- The API ----------
  const jiraUrl = (ticket: Ticket) => ticket.url ?? `https://acme.atlassian.net/browse/${ticket.key}`;
  const route = (path: string) => `*${path}`;
  const json = (body: unknown) => HttpResponse.json(body as JsonBodyType);
  const notFound = () =>
    HttpResponse.json({ code: 'not_found', message: 'There is no session with this id.' }, { status: 404 });
  const synced = () => ({ state: 'synced', at: iso() }) as const;
  const status = f.makeStatus({
    version: '0.1.52',
    user: { name: 'Alex Morgan' },
    agents: { claude: { connected: true }, codex: { connected: true } },
    integrations: {
      jira: {
        state: 'connected',
        detail: 'Personal API token for acme.atlassian.net',
        account: 'alex@acme.dev',
        checkedAt: iso(),
      },
      github: { state: 'connected', detail: 'Through the gh command', account: 'alexmorgan', checkedAt: iso() },
      slack: { state: 'connected', detail: 'Acme workspace', account: 'Alex Morgan', checkedAt: iso() },
      discord: { state: 'connected', detail: 'Bot Orynx in Acme Eng', account: 'Orynx', checkedAt: iso() },
    },
  });
  const models = {
    claude: {
      state: 'ready',
      models: [
        {
          value: 'opus',
          displayName: 'Opus',
          description: 'For complex work',
          efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
        { value: 'sonnet', displayName: 'Sonnet', description: 'Everyday tasks', efforts: ['low', 'medium', 'high'] },
        { value: 'haiku', displayName: 'Haiku', description: 'Fastest', efforts: [] },
      ],
    },
    codex: {
      state: 'ready',
      models: [
        {
          value: 'gpt-5.5-codex',
          displayName: 'GPT-5.5 Codex',
          description: 'Codex’s default',
          efforts: ['low', 'medium', 'high'],
        },
      ],
    },
  };
  const withSessionId =
    (handle: (session: Session, request: Request) => Response | Promise<Response>) =>
    async ({ params, request }: { params: PathParams; request: Request }) => {
      const session = find(String(params['id']));
      return session === undefined ? notFound() : handle(session, request);
    };

  const handlers: HttpHandler[] = [
    http.get(route(apiRoutes.status), () => json(status)),
    http.get(route(apiRoutes.setup), () => json({ done: true })),
    http.get(route(apiRoutes.profile), () => json(profile)),
    http.put(route(apiRoutes.profile), async ({ request }) => {
      profile = ProfileSchema.parse(await request.json());
      return json(profile);
    }),

    // Sessions
    http.get(route(apiRoutes.sessions), ({ request }) => {
      const pinned = new URL(request.url).searchParams.get('pinned');
      const listed = sessions.filter(
        (session) => pinned === null || (session.pinnedAt !== null) === (pinned === 'true'),
      );
      // shortcut: one page of every session, which is fine for the demo's dozen; page by cursor if it grows.
      return json({ sessions: listed.map((session) => SessionSummarySchema.parse(session)), nextCursor: null });
    }),
    http.post(route(apiRoutes.sessions), async ({ request }) => json(start(await request.json()))),
    http.get(
      route(apiRoutes.session),
      withSessionId((session) => json(session)),
    ),
    http.patch(
      route(apiRoutes.session),
      withSessionId(async (session, request) => {
        const { title, pinned } = SessionChangeRequestSchema.parse(await request.json());
        change(session.id, () => ({
          ...(title === undefined ? {} : { title }),
          ...(pinned === undefined ? {} : { pinnedAt: pinned ? iso() : null }),
        }));
        return new HttpResponse(null, { status: 204 });
      }),
    ),
    http.delete(
      route(apiRoutes.session),
      withSessionId((session) => {
        stopTimers(session.id);
        sessions.splice(sessions.indexOf(session), 1);
        emit({ type: 'sessions.changed' }, { type: 'tickets.changed' });
        return new HttpResponse(null, { status: 204 });
      }),
    ),
    http.post(
      route(apiRoutes.sessionStop),
      withSessionId((session) => {
        stopTimers(session.id);
        add(
          session.id,
          { kind: 'stopped' },
          { state: 'stopped', approvals: [], endedAt: iso(), runStartedAt: null },
          true,
        );
        return new HttpResponse(null, { status: 204 });
      }),
    ),
    http.post(
      route(apiRoutes.sessionDiscard),
      withSessionId((session) => {
        stopTimers(session.id);
        change(session.id, () => ({
          state: 'stopped',
          approvals: [],
          discardedAt: iso(),
          followUp: { kind: 'discarded' },
        }));
        return new HttpResponse(null, { status: 204 });
      }),
    ),
    http.post(route(apiRoutes.sessionApproval), async ({ params, request }) =>
      answer(String(params['id']), String(params['approvalId']), await request.json()),
    ),
    http.post(
      route(apiRoutes.sessionMessages),
      withSessionId(async (session, request) => {
        const { text, context } = SendMessageRequestSchema.parse(await request.json());
        add(
          session.id,
          { kind: 'message', text },
          { state: 'working', runStartedAt: iso(), context: [...session.context, ...context] },
          true,
        );
        later(session.id, 1, () => {
          add(session.id, { kind: 'edit', files: filesFor(session) }, { step: 'build' });
        });
        later(session.id, 2, () => {
          finish(session.id);
        });
        return json({ result: 'sent' });
      }),
    ),
    http.get(
      route(apiRoutes.sessionChanges),
      withSessionId((session) =>
        json(changes.get(session.id) ?? { state: 'ready', files: [], moreFiles: 0, added: 0, removed: 0 }),
      ),
    ),
    http.get(
      route(apiRoutes.sessionChangesDiff),
      withSessionId((session, request) => {
        const path = new URL(request.url).searchParams.get('path') ?? '';
        const diff = diffs.get(session.id);
        return json(
          diff?.path === path
            ? diff
            : f.makeFileDiff({
                path,
                lines: [
                  { kind: 'hunk', text: '@@ -1,1 +1,2 @@' },
                  { kind: 'context', number: 1, text: '…' },
                ],
              }),
        );
      }),
    ),
    http.post(
      route(apiRoutes.sessionPullRequestDraft),
      withSessionId((session) => {
        const files = filesFor(session);
        const key = session.source?.kind === 'jira' ? `${session.source.key}: ` : '';
        return json(
          f.makePullRequestDraft({
            title: `${key}${session.title}`,
            body: `## What changed\n\n${files.map((file) => `- \`${file}\``).join('\n')}\n\n## How it was checked\n\n\`pnpm test\` passes.`,
            files: files.length,
            branch: session.branch ?? 'feat/demo',
            repository: `acme/${session.folder?.name ?? 'storefront-web'}`,
            base: 'main',
          }),
        );
      }),
    ),
    http.post(
      route(apiRoutes.sessionPullRequest),
      withSessionId(async (session, request) => {
        const { title } = CreatePullRequestRequestSchema.parse(await request.json());
        const number = 1190 + serial;
        const repository = `acme/${session.folder?.name ?? 'storefront-web'}`;
        const url = `https://github.com/${repository}/pull/${String(number)}`;
        const branch = session.branch ?? 'feat/demo';
        add(
          session.id,
          { kind: 'pull_request', number, url, files: filesFor(session).length, branch, linked: false },
          {
            state: 'pr_open',
            step: 'pull_request',
            unpushed: false,
            pullRequest: f.makeSessionPullRequest({ number, url, repository, openedAt: iso(), title }),
          },
          true,
        );
        if (session.source?.kind === 'jira') moveTicket(session.source.key, 'in_review', 'In Review');
        return json({ result: 'opened', number, url, linked: false });
      }),
    ),
    http.post(
      route(apiRoutes.sessionPushDraft),
      withSessionId((session) =>
        json(
          session.pullRequest === null || !session.unpushed
            ? { result: 'nothing_new' }
            : f.makePushDraft({
                message: `Address review on #${String(session.pullRequest.number)}`,
                files: 2,
                branch: session.branch ?? 'feat/demo',
                number: session.pullRequest.number,
              }),
        ),
      ),
    ),
    http.post(
      route(apiRoutes.sessionPush),
      withSessionId((session) => {
        const pull = session.pullRequest;
        if (pull === null) return json({ result: 'nothing_new' });
        add(
          session.id,
          { kind: 'pushed', number: pull.number, url: pull.url, files: 2 },
          { unpushed: false, state: 'pr_open' },
          true,
        );
        return json({ result: 'pushed', files: 2 });
      }),
    ),
    http.patch(route(apiRoutes.sessionReviewComment), async ({ params, request }) => {
      const id = String(params['id']);
      const commentChange = ReviewCommentChangeSchema.parse(await request.json());
      change(id, (session) => ({
        review: session.review && {
          ...session.review,
          comments: session.review.comments.map((comment) =>
            comment.id === params['commentId']
              ? { ...comment, keep: commentChange.keep ?? comment.keep, text: commentChange.text ?? comment.text }
              : comment,
          ),
        },
      }));
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(route(apiRoutes.sessionReviewStatus), () => json({ result: 'ready', pushed: 0 })),
    http.post(
      route(apiRoutes.sessionReview),
      withSessionId(async (session, request) => {
        const { summary, verdict } = PostReviewRequestSchema.parse(await request.json());
        const review = session.review;
        if (review === null) return json({ result: 'cannot', reason: 'not_review' });
        const kept = review.comments.filter((comment) => comment.keep && comment.postedAt === null);
        const at = iso();
        change(session.id, () => ({
          review: {
            ...review,
            summary,
            verdict,
            comments: review.comments.map((comment) =>
              kept.includes(comment) ? { ...comment, postedAt: at } : comment,
            ),
            posted: [...review.posted, { url: review.url, at }],
          },
        }));
        return json({ result: 'posted', url: review.url, comments: kept.length });
      }),
    ),
    http.get(route(apiRoutes.sessionCommands), () => json({ commands: [] })),
    http.get(route(apiRoutes.sessionPorts), () => json({ ports: [] })),
    http.get(route(apiRoutes.sessionTerminal), () => json(f.makeTerminal())),
    http.post(route(apiRoutes.sessionTerminalSize), () => new HttpResponse(null, { status: 204 })),

    // Inbox, tickets and search
    http.get(route(apiRoutes.inbox), () => json(inbox)),
    http.post(route(apiRoutes.inboxRefresh), () => {
      inbox = { ...inbox, syncedAt: iso(), tools: { ...inbox.tools, jira: synced(), github: synced() } };
      emit({ type: 'inbox.changed' });
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(route(apiRoutes.syncActivity), () => json(f.makeSyncActivity())),
    http.get(route(apiRoutes.tickets), () =>
      json(
        f.makeTickets({
          jira: synced(),
          sprint: {
            id: 18,
            name: 'Sprint 18',
            endsAt: new Date(Date.now() + 4 * 86_400_000).toISOString(),
            projectKey: 'SHOP',
          },
          tickets: world.tickets.map(withSession),
        }),
      ),
    ),
    // Before /tickets/:key, which would take "sprints" for a key.
    http.get(route(apiRoutes.ticketsSprints), () => json({ sprints: [] })),
    http.get(route(apiRoutes.ticket), ({ params }) => {
      const ticket = world.tickets.find((one) => one.key === params['key']);
      if (ticket === undefined) return json({ result: 'not_found' });
      const session = withSession(ticket).session;
      return json({
        result: 'found',
        ticket: f.makeTicketDetail({
          key: ticket.key,
          url: jiraUrl(ticket),
          title: ticket.title,
          type: ticket.type,
          status: { name: ticket.status, column: ticket.column },
          priority: ticket.priority?.name ?? 'Medium',
          assignee: 'Alex Morgan',
          reporter: 'Neha K.',
          dueDate: ticket.dueDate,
          description: `${ticket.title}.`,
          session: session === null ? null : { id: session.id, state: session.state },
        }),
      });
    }),
    http.get(route(apiRoutes.orynxTickets), () => json({ tickets: [] })),
    http.get(route(apiRoutes.jiraTicketTypes), () => json(f.makeJiraTicketTypes())),
    http.get(route(apiRoutes.jiraProjects), () => json({ projects: [] })),
    http.get(route(apiRoutes.search), () =>
      json(
        f.makeSearchIndex({
          tickets: world.tickets.map((ticket) =>
            f.makeSearchTicket({
              key: ticket.key,
              title: ticket.title,
              status: ticket.status,
              target: { kind: 'external', url: jiraUrl(ticket) },
            }),
          ),
          pullRequests: inbox.items.flatMap((item) =>
            item.subject.kind === 'pull_request' && item.target.kind === 'external'
              ? [
                  f.makeSearchPullRequest({
                    id: `acme/${item.subject.repository}#${String(item.subject.number)}`,
                    repository: item.subject.repository,
                    number: item.subject.number,
                    title: item.title,
                    author: item.subject.author ?? 'Alex Morgan',
                    url: item.target.url,
                  }),
                ]
              : [],
          ),
          sessions: sessions.map((session) => SessionSummarySchema.parse(session)),
          tools: { jira: synced(), github: synced() },
        }),
      ),
    ),

    // Settings
    http.get(route(apiRoutes.preferences), () => json(preferences)),
    http.patch(route(apiRoutes.preferences), async ({ request }) => {
      const {
        permissions,
        inboxRules,
        allowCommand,
        disallowCommand,
        repository: _r,
        followAll: _f,
        ...rest
      } = PreferencesChangeSchema.parse(await request.json());
      preferences = PreferencesSchema.parse({
        ...preferences,
        ...rest,
        permissions: { ...preferences.permissions, ...permissions },
        inboxRules: { ...preferences.inboxRules, ...inboxRules },
        allowedCommands: [...preferences.allowedCommands, ...(allowCommand ? [allowCommand] : [])].filter(
          (one) => one !== disallowCommand,
        ),
      });
      emit({ type: 'settings.changed' });
      return json(preferences);
    }),
    http.get(route(apiRoutes.repositories), () => json({ repositories })),
    http.get(route(apiRoutes.storage), () =>
      json(
        f.makeStorage({
          bytes: 1_240_000_000,
          choices: ([7, 14, 30, 90] as const).map((days, at) => ({
            days,
            sessions: 6 - at,
            bytes: (6 - at) * 180_000_000,
          })),
        }),
      ),
    ),
    http.get(route(apiRoutes.jiraConnection), () =>
      json(f.makeJiraConnection({ saved: { site: 'acme.atlassian.net', email: 'alex@acme.dev' } })),
    ),
    http.get(route(apiRoutes.githubConnection), () =>
      json(f.makeGitHubConnection({ saved: { method: 'gh' }, ghFound: true })),
    ),
    http.get(route(apiRoutes.slackConnection), () =>
      json(
        f.makeSlackConnection({
          saved: { workspace: 'Acme', url: 'https://acme.slack.com/', userId: 'U024BE7LH', name: 'Alex Morgan' },
        }),
      ),
    ),
    http.get(route(apiRoutes.discordConnection), () => json(f.makeDiscordConnection())),
    http.get(route(apiRoutes.claudeLogin), () =>
      json(f.makeClaudeSignedIn({ email: 'alex@acme.dev', organisation: 'Acme' })),
    ),
    http.get(route(apiRoutes.codexLogin), () =>
      json({ state: 'signed_in', method: 'chatgpt', email: 'alex@acme.dev' }),
    ),
    http.get(route(apiRoutes.agentModels), ({ request }) =>
      json(new URL(request.url).searchParams.get('agent') === 'codex' ? models.codex : models.claude),
    ),
    http.get(route(apiRoutes.agentsAccess), () => json({ enabled: false })),
    http.get(route(apiRoutes.orynxSkills), () => json(f.makeOrynxSkillList())),
    http.get(route(apiRoutes.skills), () => json({ skills: [] })),
    http.get(route(apiRoutes.updates), () =>
      json(f.makeUpdates({ kind: 'service', running: { release: '0.1.52', commits: 0, commit: null } } as never)),
    ),

    // Notifications
    http.get(route(apiRoutes.notifications), () => json(f.makeNotificationList(notifications))),
    http.post(route(apiRoutes.notificationsRead), async ({ request }) => {
      const read = MarkNotificationsReadSchema.parse(await request.json());
      notifications = notifications.map((one) =>
        'all' in read || read.ids.includes(one.id) ? { ...one, read: true } : one,
      );
      emit({ type: 'notifications.changed' });
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(route(apiRoutes.notificationSettings), () => json(notificationSettings)),
    http.patch(route(apiRoutes.notificationSettings), async ({ request }) => {
      const { events, ...rest } = NotificationSettingsChangeSchema.parse(await request.json());
      notificationSettings = NotificationSettingsSchema.parse({
        ...notificationSettings,
        ...rest,
        events: Object.fromEntries(
          Object.entries(notificationSettings.events).map(([event, choice]) => [
            event,
            { ...choice, ...(events as Record<string, object> | undefined)?.[event] },
          ]),
        ),
      });
      return json(notificationSettings);
    }),

    // Anything else would change a real tool or this computer, which a demo can't do.
    http.all(route('/api/*'), () =>
      HttpResponse.json(
        { code: 'bad_request', message: 'The demo can’t do this. Install Orynx to use it for real.' },
        { status: 400 },
      ),
    ),
  ];

  return { handlers, EventSource: DemoEventSource };
}
