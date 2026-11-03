import type {
  FileDiff,
  Inbox,
  Notification,
  Repository,
  Session,
  SessionChanges,
  SessionStepItem,
  Ticket,
} from '@devhub/contracts';
import * as f from '@devhub/contracts/testing';

/**
 * Acme's made-up world on the demo's first load: Alex's sessions, inbox and sprint, as the landing page's screenshots
 * show them. Every value comes from a contract factory, so a shape the app can't read throws here, not in the page.
 */
export interface World {
  sessions: Session[];
  changes: Map<string, SessionChanges>;
  diffs: Map<string, FileDiff>;
  inbox: Inbox;
  tickets: Ticket[];
  notifications: Notification[];
  repositories: Repository[];
}

export const buildSteps: SessionStepItem[] = [
  { kind: 'plan', label: 'Plan' },
  { kind: 'build', label: 'Build' },
  { kind: 'test', label: 'Test' },
  { kind: 'pull_request', label: 'Pull request' },
];

export const ids = {
  delivery: 'a1b2c3d4e5f60002',
  csv: 'a1b2c3d4e5f60001',
  review: 'a1b2c3d4e5f60003',
  rounding: 'a1b2c3d4e5f60004',
  audit: 'a1b2c3d4e5f60005',
  search: 'a1b2c3d4e5f60006',
};

export const storefront = f.makeRepository({
  id: '00000000000000aa',
  path: '/Users/alex/code/storefront-web',
  name: 'storefront-web',
  displayPath: '~/code/storefront-web',
  jiraProject: 'SHOP',
});
const payments = f.makeRepository({
  id: '00000000000000bb',
  path: '/Users/alex/code/payments-api',
  name: 'payments-api',
  displayPath: '~/code/payments-api',
  jiraProject: 'PAY',
});
export const folderOf = (repository: Repository) => ({ name: repository.name, displayPath: repository.displayPath });

export function createWorld(now: number): World {
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  const day = (offset: number) => new Date(now + offset * 86_400_000).toISOString().slice(0, 10);
  const jiraUrl = (key: string) => `https://acme.atlassian.net/browse/${key}`;

  // Claude asks which delivery source to use, mid-build (spec 051), with its to-dos (spec 046).
  const delivery = f.makeSession({
    id: ids.delivery,
    title: 'Show a delivery estimate on checkout',
    state: 'needs_you',
    source: { kind: 'jira', key: 'SHOP-476' },
    updatedAt: ago(1),
    folder: folderOf(storefront),
    branch: 'feat/SHOP-476-delivery-estimate',
    step: 'build',
    steps: buildSteps,
    intent: 'change',
    branchFrom: 'repo_rules',
    startedAt: ago(14),
    runStartedAt: ago(14),
    jiraUrl: jiraUrl('SHOP-476'),
    sprint: 'Sprint 18',
    worktreePath: '/Users/alex/.devhub/worktrees/a1b2c3d4e5f60002',
    changed: true,
    activities: [
      {
        id: 'd2',
        state: 'done',
        step: 'plan',
        at: ago(13),
        kind: 'explore',
        files: ['src/checkout/Summary.tsx', 'src/shipping/carriers.ts', 'src/shipping/zones.ts'],
      },
      {
        id: 'd3',
        state: 'done',
        step: 'plan',
        at: ago(12),
        kind: 'plan',
        items: [
          'Add a getEstimate helper',
          'Show the estimate under Shipping',
          'Cover slow carriers with a range',
          'Test the helper',
        ],
        statuses: ['completed', 'in_progress', 'pending', 'pending'],
      },
      {
        id: 'd5',
        state: 'done',
        step: 'build',
        at: ago(8),
        kind: 'edit',
        files: ['src/shipping/estimate.ts', 'src/checkout/Summary.tsx'],
      },
      {
        id: 'd6',
        state: 'running',
        step: 'build',
        at: ago(1),
        kind: 'waiting',
        approvalId: 'q1',
        about: 'question',
        text: 'Where should the estimate come from?',
      },
    ],
    approvals: [
      f.makeQuestionApproval({
        id: 'q1',
        askedAt: ago(1),
        questions: [
          {
            question: 'Where should the estimate come from?',
            header: 'Source',
            multiSelect: false,
            options: [
              { label: 'Carrier API', description: 'Live dates from each carrier' },
              { label: 'Zone table', description: 'Fixed days per zone, no call' },
            ],
          },
        ],
      }),
    ],
    ticket: f.makeSessionTicket({
      type: 'Story',
      description:
        'Shoppers want to know when an order arrives before they pay.\n\n### Acceptance criteria\n\n' +
        '- Show an estimate under Shipping\n- Show a range when the carrier is slow',
      status: { name: 'In Progress', column: 'in_progress' },
      dueDate: day(3),
    }),
    context: [
      { kind: 'jira', key: 'SHOP-476' },
      {
        kind: 'slack_thread',
        channel: 'C024BE91L',
        ts: '1762160000.123456',
        label: { from: 'Neha K.', channel: 'checkout', server: null },
      },
    ],
  });

  // Codex wants to run the orders tests (spec 052 + 012).
  const csv = f.makeSession({
    id: ids.csv,
    title: 'Add CSV export to the orders report',
    state: 'needs_you',
    source: { kind: 'jira', key: 'SHOP-482' },
    updatedAt: ago(2),
    agent: 'codex',
    folder: folderOf(storefront),
    branch: 'feat/SHOP-482',
    step: 'test',
    steps: buildSteps,
    intent: 'change',
    startedAt: ago(16),
    runStartedAt: ago(16),
    jiraUrl: jiraUrl('SHOP-482'),
    sprint: 'Sprint 18',
    changed: true,
    worktreePath: '/Users/alex/.devhub/worktrees/a1b2c3d4e5f60001',
    activities: [
      {
        id: 'c1',
        state: 'done',
        step: 'plan',
        at: ago(15),
        kind: 'plan',
        items: ['Add a toCsv helper', 'Add Export CSV to the toolbar', 'Test the helper'],
        statuses: ['completed', 'completed', 'in_progress'],
      },
      {
        id: 'c2',
        state: 'done',
        step: 'build',
        at: ago(12),
        kind: 'edit',
        files: [
          'src/orders/OrdersReport.tsx',
          'src/lib/csv.ts',
          'src/orders/api/ordersApi.ts',
          'src/lib/__tests__/csv.test.ts',
        ],
      },
      {
        id: 'c3',
        state: 'running',
        step: 'test',
        at: ago(2),
        kind: 'waiting',
        approvalId: 'a1',
        about: 'command',
        text: 'Run the orders tests',
      },
    ],
    approvals: [
      f.makeSessionApproval({
        id: 'a1',
        command: 'pnpm test -- orders',
        description: 'Run the orders tests',
        alwaysAllow: 'pnpm test',
        askedAt: ago(2),
      }),
    ],
    ticket: f.makeSessionTicket({
      type: 'Story',
      description: 'Finance exports the orders report by hand every Monday.',
      status: { name: 'In Progress', column: 'in_progress' },
      dueDate: day(2),
    }),
    context: [{ kind: 'jira', key: 'SHOP-482' }],
  });

  // Claude's review of Jordan's payments-api #318 (spec 050): three comments under their lines, nothing posted.
  const reviewSummary =
    'Two things to fix before this ships: the backoff has no ceiling, and a 410 keeps retrying. The tests are clear.';
  const review = f.makeSession({
    id: ids.review,
    title: 'Retry failed webhook deliveries with backoff',
    state: 'done',
    ready: 'nothing',
    mode: 'ask',
    source: { kind: 'pull_request', number: 318 },
    updatedAt: ago(9),
    folder: folderOf(payments),
    branch: null,
    step: 'review',
    steps: [],
    startedAt: ago(15),
    endedAt: ago(9),
    workedMs: 5 * 60_000 + 12_000,
    jiraUrl: null,
    sprint: null,
    activities: [
      {
        id: 'v1',
        state: 'done',
        step: 'review',
        at: ago(15),
        kind: 'explore',
        files: ['src/webhooks/retry.ts', 'src/webhooks/deliver.ts', 'src/webhooks/__tests__/retry.test.ts'],
      },
      {
        id: 'v2',
        state: 'done',
        step: 'review',
        at: ago(11),
        kind: 'commented',
        path: 'src/webhooks/retry.ts',
        line: 18,
        side: 'new',
      },
      {
        id: 'v3',
        state: 'done',
        step: 'review',
        at: ago(10),
        kind: 'commented',
        path: 'src/webhooks/retry.ts',
        line: 31,
        side: 'new',
      },
      {
        id: 'v4',
        state: 'done',
        step: 'review',
        at: ago(10),
        kind: 'commented',
        path: 'src/webhooks/__tests__/retry.test.ts',
        line: 9,
        side: 'new',
      },
      { id: 'v5', state: 'done', step: 'review', at: ago(9), kind: 'finished', summary: reviewSummary },
    ],
    review: f.makeSessionReview({
      repository: 'acme/payments-api',
      number: 318,
      url: 'https://github.com/acme/payments-api/pull/318',
      comments: [
        f.makeReviewComment({
          id: 'r1',
          path: 'src/webhooks/retry.ts',
          line: 18,
          side: 'new',
          text: 'The delay never caps: after 12 tries this waits over an hour. Cap it at `maxDelayMs` and add jitter, or every failed endpoint retries at the same moment.',
        }),
        f.makeReviewComment({
          id: 'r2',
          path: 'src/webhooks/retry.ts',
          line: 31,
          side: 'new',
          text: 'A 410 Gone means the endpoint was removed. Stop retrying here instead of counting it as a failure.',
        }),
        f.makeReviewComment({
          id: 'r3',
          path: 'src/webhooks/__tests__/retry.test.ts',
          line: 9,
          side: 'new',
          text: 'Nice: the fake clock keeps this fast.',
          keep: false,
        }),
      ],
      summary: reviewSummary,
      verdict: 'request_changes',
    }),
    context: [{ kind: 'pull_request', owner: 'acme', name: 'payments-api', number: 318 }],
  });

  // Your own pull request's checks failed; Claude fixed it on its branch and waits for Push (spec 031).
  const rounding = f.makeSession({
    id: ids.rounding,
    title: 'Fix rounding in multi-currency cart totals',
    state: 'done',
    ready: 'push',
    source: { kind: 'pull_request', number: 1179 },
    updatedAt: ago(25),
    folder: folderOf(storefront),
    branch: 'fix/cart-rounding',
    workOn: 'pull_request',
    step: 'pull_request',
    steps: [...buildSteps.slice(0, 3), { kind: 'pull_request', label: 'Push' }],
    intent: 'change',
    startedAt: ago(40),
    endedAt: ago(25),
    workedMs: 11 * 60_000,
    jiraUrl: null,
    sprint: null,
    changed: true,
    worktreePath: '/Users/alex/.devhub/worktrees/a1b2c3d4e5f60004',
    pullRequest: f.makeSessionPullRequest({
      number: 1179,
      url: 'https://github.com/acme/storefront-web/pull/1179',
      repository: 'acme/storefront-web',
      openedAt: ago(300),
      title: 'Fix rounding in multi-currency cart totals',
    }),
    activities: [
      {
        id: 'o1',
        state: 'done',
        step: 'plan',
        at: ago(39),
        kind: 'explore',
        files: ['src/cart/totals.ts', 'src/money/round.ts'],
      },
      {
        id: 'o2',
        state: 'done',
        step: 'build',
        at: ago(33),
        kind: 'edit',
        files: ['src/money/round.ts', 'src/cart/totals.ts'],
      },
      {
        id: 'o3',
        state: 'done',
        step: 'test',
        at: ago(28),
        kind: 'command',
        commands: ['pnpm test -- cart'],
        calls: [{ id: 'o3a', failed: false }],
      },
      {
        id: 'o4',
        state: 'done',
        step: 'test',
        at: ago(25),
        kind: 'finished',
        summary: 'Totals now round once, in the cart’s currency, after summing in minor units. The cart tests pass.',
      },
    ],
    context: [{ kind: 'pull_request', owner: 'acme', name: 'storefront-web', number: 1179 }],
  });

  const audit = f.makeSession({
    id: ids.audit,
    title: 'Paginate the audit log endpoint',
    state: 'pr_open',
    source: { kind: 'jira', key: 'PAY-207' },
    updatedAt: ago(60),
    folder: folderOf(payments),
    branch: 'feat/PAY-207-audit-pages',
    step: 'pull_request',
    steps: buildSteps,
    intent: 'change',
    startedAt: ago(90),
    endedAt: ago(70),
    workedMs: 17 * 60_000,
    jiraUrl: jiraUrl('PAY-207'),
    sprint: 'Sprint 18',
    changed: true,
    unpushed: false,
    worktreePath: '/Users/alex/.devhub/worktrees/a1b2c3d4e5f60005',
    pullRequest: f.makeSessionPullRequest({
      number: 322,
      url: 'https://github.com/acme/payments-api/pull/322',
      repository: 'acme/payments-api',
      openedAt: ago(60),
      title: 'PAY-207: Paginate the audit log endpoint',
    }),
    activities: [
      {
        id: 'p1',
        state: 'done',
        step: 'plan',
        at: ago(88),
        kind: 'explore',
        files: ['src/audit/routes.ts', 'src/audit/store.ts'],
      },
      {
        id: 'p2',
        state: 'done',
        step: 'build',
        at: ago(80),
        kind: 'edit',
        files: ['src/audit/routes.ts', 'src/audit/store.ts', 'src/audit/cursor.ts'],
      },
      {
        id: 'p3',
        state: 'done',
        step: 'test',
        at: ago(72),
        kind: 'command',
        commands: ['pnpm test -- audit'],
        calls: [{ id: 'p3a', failed: false }],
      },
      {
        id: 'p4',
        state: 'done',
        step: 'test',
        at: ago(70),
        kind: 'finished',
        summary:
          'GET /audit takes a cursor and a limit of up to 200, and answers the next cursor. Old clients get the first page.',
      },
      {
        id: 'p5',
        state: 'done',
        step: 'pull_request',
        at: ago(60),
        kind: 'pull_request',
        number: 322,
        url: 'https://github.com/acme/payments-api/pull/322',
        files: 0,
        branch: 'feat/PAY-207-audit-pages',
        linked: false,
      },
    ],
    ticket: f.makeSessionTicket({
      type: 'Story',
      description: 'The audit log endpoint answers every row at once and times out for big accounts.',
      status: { name: 'In Review', column: 'in_review' },
      dueDate: null,
    }),
    context: [{ kind: 'jira', key: 'PAY-207' }],
  });

  const search = f.makeSession({
    id: ids.search,
    title: 'Why is product search slow on page 2?',
    state: 'done',
    ready: 'nothing',
    mode: 'ask',
    source: null,
    updatedAt: ago(120),
    folder: folderOf(storefront),
    branch: null,
    step: 'answer',
    steps: [],
    startedAt: ago(126),
    endedAt: ago(120),
    workedMs: 6 * 60_000,
    jiraUrl: null,
    sprint: null,
    activities: [
      {
        id: 's1',
        state: 'done',
        step: 'answer',
        at: ago(125),
        kind: 'explore',
        files: ['src/search/useSearch.ts', 'src/search/api.ts', 'src/search/ResultsPage.tsx'],
      },
      {
        id: 's2',
        state: 'done',
        step: 'answer',
        at: ago(120),
        kind: 'finished',
        summary:
          'Page 2 asks the API with `offset=20` and no `cursor`, so the search service scans and drops the first 20 hits on every request. `useSearch` already gets `nextCursor` back; pass it in `src/search/api.ts` instead of the offset and page 2 is as fast as page 1.',
      },
    ],
  });

  const changes = new Map<string, SessionChanges>([
    [
      ids.csv,
      f.makeSessionChanges({
        files: [
          f.makeChangedFile({ path: 'src/orders/OrdersReport.tsx', added: 46, removed: 8 }),
          f.makeChangedFile({ path: 'src/lib/csv.ts', added: 38, removed: 0 }),
          f.makeChangedFile({ path: 'src/orders/api/ordersApi.ts', added: 21, removed: 3 }),
          f.makeChangedFile({ path: 'src/lib/__tests__/csv.test.ts', added: 44, removed: 0 }),
        ],
        added: 149,
        removed: 11,
      }),
    ],
    [
      ids.delivery,
      f.makeSessionChanges({
        files: [
          f.makeChangedFile({ path: 'src/shipping/estimate.ts', added: 41, removed: 0 }),
          f.makeChangedFile({ path: 'src/checkout/Summary.tsx', added: 12, removed: 3 }),
        ],
        added: 53,
        removed: 3,
      }),
    ],
    [
      ids.review,
      f.makeSessionChanges({
        files: [
          f.makeChangedFile({ path: 'src/webhooks/retry.ts', added: 34, removed: 6 }),
          f.makeChangedFile({ path: 'src/webhooks/deliver.ts', added: 9, removed: 4 }),
          f.makeChangedFile({ path: 'src/webhooks/__tests__/retry.test.ts', added: 52, removed: 0 }),
        ],
        added: 95,
        removed: 10,
      }),
    ],
    [
      ids.rounding,
      f.makeSessionChanges({
        files: [
          f.makeChangedFile({ path: 'src/money/round.ts', added: 14, removed: 9 }),
          f.makeChangedFile({ path: 'src/cart/totals.ts', added: 6, removed: 4 }),
        ],
        added: 20,
        removed: 13,
      }),
    ],
    [
      ids.audit,
      f.makeSessionChanges({
        files: [
          f.makeChangedFile({ path: 'src/audit/routes.ts', added: 22, removed: 5 }),
          f.makeChangedFile({ path: 'src/audit/store.ts', added: 31, removed: 8 }),
          f.makeChangedFile({ path: 'src/audit/cursor.ts', added: 27, removed: 0 }),
        ],
        added: 80,
        removed: 13,
      }),
    ],
  ]);

  const diffs = new Map<string, FileDiff>([
    [
      ids.csv,
      f.makeFileDiff({
        path: 'src/orders/OrdersReport.tsx',
        lines: [
          { kind: 'hunk', text: '@@ -12,7 +12,9 @@ import { ReportToolbar } from "./ReportToolbar";' },
          { kind: 'context', number: 12, text: 'export function OrdersReport({ filters }: Props) {' },
          { kind: 'context', number: 13, text: '  const orders = useOrders(filters);' },
          { kind: 'removed', number: 14, text: '  const [busy, setBusy] = useState(false);' },
          { kind: 'added', number: 14, text: '  const exportCsv = useCsvExport("orders", filters);' },
          { kind: 'added', number: 15, text: '  const columns = useReportColumns();' },
          { kind: 'context', number: 16, text: '' },
          { kind: 'hunk', text: '@@ -31,6 +33,12 @@ export function OrdersReport({ filters }: Props) {' },
          { kind: 'context', number: 33, text: '    <ReportToolbar title="Orders">' },
          { kind: 'added', number: 34, text: '      <Button' },
          { kind: 'added', number: 35, text: '        variant="secondary"' },
          { kind: 'added', number: 36, text: '        disabled={exportCsv.isPending}' },
          { kind: 'added', number: 37, text: '        onClick={() => exportCsv.mutate(columns)}' },
          { kind: 'added', number: 38, text: '      >' },
          { kind: 'added', number: 39, text: '        Export CSV' },
          { kind: 'added', number: 40, text: '      </Button>' },
          { kind: 'context', number: 41, text: '    </ReportToolbar>' },
        ],
      }),
    ],
    [
      ids.delivery,
      f.makeFileDiff({
        path: 'src/shipping/estimate.ts',
        lines: [
          { kind: 'hunk', text: '@@ -0,0 +1,14 @@' },
          { kind: 'added', number: 1, text: 'import { zones } from "./zones";' },
          { kind: 'added', number: 2, text: 'import type { Carrier } from "./carriers";' },
          { kind: 'added', number: 3, text: '' },
          { kind: 'added', number: 4, text: 'export interface Estimate {' },
          { kind: 'added', number: 5, text: '  earliest: Date;' },
          { kind: 'added', number: 6, text: '  latest: Date;' },
          { kind: 'added', number: 7, text: '}' },
          { kind: 'added', number: 8, text: '' },
          { kind: 'added', number: 9, text: 'export function getEstimate(zip: string, carrier: Carrier): Estimate {' },
          { kind: 'added', number: 10, text: '  const zone = zones.find((z) => z.matches(zip)) ?? zones.default;' },
          { kind: 'added', number: 11, text: '  const days = zone.days[carrier.id];' },
          { kind: 'added', number: 12, text: '  return { earliest: addBusinessDays(today(), days.min),' },
          { kind: 'added', number: 13, text: '           latest: addBusinessDays(today(), days.max) };' },
          { kind: 'added', number: 14, text: '}' },
        ],
      }),
    ],
    [
      ids.review,
      f.makeFileDiff({
        path: 'src/webhooks/retry.ts',
        lines: [
          { kind: 'hunk', text: '@@ -10,9 +10,25 @@ import { deliver } from "./deliver";' },
          { kind: 'context', number: 10, text: 'const baseDelayMs = 1_000;' },
          { kind: 'context', number: 11, text: '' },
          { kind: 'removed', number: 12, text: 'export async function retry(job: Job) {' },
          { kind: 'removed', number: 13, text: '  setTimeout(() => deliver(job), baseDelayMs);' },
          { kind: 'added', number: 12, text: 'export async function retry(job: Job, attempt = 1) {' },
          { kind: 'added', number: 13, text: '  if (attempt > maxAttempts) return markDead(job);' },
          { kind: 'added', number: 14, text: '  const res = await deliver(job);' },
          { kind: 'added', number: 15, text: '  if (res.ok) return markDelivered(job);' },
          { kind: 'added', number: 16, text: '' },
          { kind: 'added', number: 17, text: '  // Back off: 1 s, 2 s, 4 s, 8 s ...' },
          { kind: 'added', number: 18, text: '  const delay = baseDelayMs * 2 ** (attempt - 1);' },
          { kind: 'added', number: 19, text: '  await schedule(job, delay, attempt + 1);' },
          { kind: 'added', number: 20, text: '}' },
          { kind: 'context', number: 21, text: '' },
          {
            kind: 'hunk',
            text: '@@ -24,4 +28,12 @@ export function schedule(job: Job, delay: number, attempt: number) {',
          },
          { kind: 'context', number: 28, text: 'export function shouldRetry(res: Response) {' },
          { kind: 'added', number: 29, text: '  if (res.status === 429) return true;' },
          { kind: 'added', number: 30, text: '  if (res.status >= 500) return true;' },
          { kind: 'added', number: 31, text: '  if (res.status >= 400) return true;' },
          { kind: 'context', number: 32, text: '  return false;' },
          { kind: 'context', number: 33, text: '}' },
        ],
      }),
    ],
  ]);

  const issue = (key: string, title: string, status: string, reason: unknown, waited: number, extra: object = {}) =>
    f.makeInboxItem({
      id: `jira:${key}`,
      source: 'jira',
      tab: 'jira',
      title,
      subject: { kind: 'issue', key, status, highPriorityBug: false, type: 'Story', ...extra },
      reason: reason as never,
      waitingSince: ago(waited),
      target: { kind: 'external', url: jiraUrl(key) },
    });
  const pr = (repo: string, number: number, title: string, author: string | null, reason: unknown, waited: number) =>
    f.makeInboxItem({
      id: `github:acme/${repo}#${String(number)}`,
      title,
      subject: { kind: 'pull_request', repository: repo, number, author, mine: author === null },
      reason: reason as never,
      waitingSince: ago(waited),
      target: { kind: 'external', url: `https://github.com/acme/${repo}/pull/${String(number)}` },
    });
  const synced = { state: 'synced', at: ago(1) } as const;

  const inbox = f.makeInbox({
    syncedAt: ago(1),
    tools: { jira: synced, github: synced, slack: synced, discord: synced },
    items: [
      f.makeInboxItem({
        id: 'jira:SHOP-482',
        source: 'jira',
        tab: 'jira',
        title: 'Add CSV export to the orders report',
        subject: { kind: 'issue', key: 'SHOP-482', status: 'In Progress', highPriorityBug: false, type: 'Story' },
        reason: { kind: 'status', category: 'in_progress' },
        waitingSince: ago(4),
        target: { kind: 'session', sessionId: ids.csv },
      }),
      f.makeSlackItem({
        title: 'Can checkout show a range when the carrier is slow? Support keeps getting asked.',
        subject: { kind: 'message', from: 'Neha K.', channel: 'checkout', server: null },
        waitingSince: ago(48),
      }),
      pr(
        'payments-api',
        318,
        'Retry failed webhook deliveries with backoff',
        'Jordan L.',
        { kind: 'review_requested' },
        240,
      ),
      pr('storefront-web', 1179, 'Fix rounding in multi-currency cart totals', null, { kind: 'checks_failing' }, 300),
      f.makeInboxItem({
        id: 'discord:1029384756102938475:1102938475610293847',
        source: 'discord',
        tab: 'discord',
        title: 'Staging webhooks are stuck at 3 retries, anyone on it?',
        subject: { kind: 'message', from: 'sam.r', channel: 'payments', server: 'Acme Eng' },
        reason: { kind: 'no_reply' },
        waitingSince: ago(95),
        target: {
          kind: 'external',
          url: 'https://discord.com/channels/1029384756102938475/1102938475610293847/1203948576102938475',
        },
      }),
      issue(
        'SHOP-491',
        'Coupon codes are case sensitive at checkout',
        'To Do',
        { kind: 'due', on: day(1), highPriorityBug: true },
        600,
        {
          highPriorityBug: true,
          type: 'Bug',
        },
      ),
      pr(
        'storefront-web',
        1184,
        'Move the cart drawer to the new design tokens',
        'Sam R.',
        { kind: 'review_requested' },
        420,
      ),
      issue('PAY-212', 'Add idempotency keys to refunds', 'To Do', { kind: 'status', category: 'to_do' }, 1440),
    ],
  });

  const ticket = (key: string, title: string, column: string, status: string, extra: Partial<Ticket> = {}) =>
    f.makeTicket({
      key,
      title,
      column: column as never,
      status,
      url: jiraUrl(key),
      assignee: { name: 'Alex Morgan', mine: true },
      dueDate: null,
      ...extra,
    });
  const tickets = [
    ticket('SHOP-491', 'Coupon codes are case sensitive at checkout', 'to_do', 'To Do', {
      type: 'Bug',
      bug: true,
      priority: { name: 'Highest', level: 'high', rank: 0 },
      dueDate: day(1),
    }),
    ticket('SHOP-488', 'Save the shopper’s last shipping address', 'to_do', 'To Do', {
      priority: { name: 'Medium', level: 'medium', rank: 2 },
    }),
    ticket('SHOP-493', 'Lazy-load product images below the fold', 'to_do', 'To Do', {
      type: 'Task',
      priority: { name: 'Low', level: 'low', rank: 3 },
    }),
    ticket('SHOP-476', 'Show a delivery estimate on checkout', 'in_progress', 'In Progress', { dueDate: day(3) }),
    ticket('SHOP-482', 'Add CSV export to the orders report', 'in_progress', 'In Progress', { dueDate: day(2) }),
    ticket('SHOP-485', 'Gift cards at checkout', 'in_progress', 'In Progress', {
      priority: { name: 'Medium', level: 'medium', rank: 2 },
    }),
    ticket('SHOP-470', 'Paginate the order history', 'in_review', 'In Review'),
    ticket('SHOP-466', 'Apple Pay on mobile checkout', 'done', 'Done'),
    ticket('SHOP-461', 'Show stock levels on the product page', 'done', 'Done', {
      priority: { name: 'Medium', level: 'medium', rank: 2 },
    }),
  ];

  const notifications = [
    f.makeNotification({
      id: 'n1',
      at: ago(25),
      what: {
        kind: 'session_finished',
        session: { id: ids.rounding, title: rounding.title, source: rounding.source },
      } as never,
    }),
  ];

  return {
    sessions: [delivery, csv, review, rounding, audit, search],
    changes,
    diffs,
    inbox,
    tickets,
    notifications,
    repositories: [storefront, payments],
  };
}
