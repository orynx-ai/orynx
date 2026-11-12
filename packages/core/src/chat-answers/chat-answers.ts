import {
  delivery,
  type DesktopQuestion,
  type NotificationSettings,
  type Session,
  type SessionApproval,
  type SessionQuestion,
} from '@devhub/contracts';
import type { DiscordClient, DiscordProblem } from '../integrations/discord/client.ts';
import type { DiscordConnectionService } from '../integrations/discord/connection.ts';
import type { SlackClient, SlackProblem } from '../integrations/slack/client.ts';
import type { SlackConnectionService } from '../integrations/slack/connection.ts';
import type { SessionReport, SessionService } from '../sessions/session-service.ts';
import { readReply } from './reply.ts';
import {
  approvalPing,
  chatWords,
  desktopQuestion,
  questionMessage,
  severalQuestions,
  type ChatWhere,
} from './words.ts';

type ChatService = 'slack' | 'discord';

/**
 * The desktop app's notifications, which the hub shows itself on macOS (spec 057, AC-15): over the utility process's
 * port, as apps/server builds it.
 */
export interface DesktopQuestions {
  show(question: DesktopQuestion): void;
  withdraw(id: string): void;
  onReply(listener: (id: string, text: string) => void): void;
}

/**
 * Orynx's message about one waiting call in one place: Slack's ts (its thread), Discord's message id, or the desktop
 * notification's id.
 */
interface Sent {
  service: ChatService | 'notification';
  channel: string;
  message: string;
  /** Slack: the last reply read in the thread, so each one is read once. */
  after: string;
}

/** A waiting call Orynx told you about. Only a call with one question is ever read for an answer. */
interface Told {
  session: string;
  approvalId: string;
  question: SessionQuestion | null;
  sent: Sent[];
  /** Your chat reply answered it, so its end needs no word in chat. */
  answeredHere: boolean;
}

export interface ChatAnswersOptions {
  settings: { read(): Promise<NotificationSettings> };
  sessions: Pick<SessionService, 'respond' | 'unsent'>;
  slack: { client: SlackClient; connection: Pick<SlackConnectionService, 'botCredentials'> };
  discord: { client: DiscordClient; connection: Pick<DiscordConnectionService, 'credentials'> };
  /** The desktop app's notifications, when the hub runs in it on macOS. */
  desktop?: DesktopQuestions;
  /** How often a sent question's thread is read for your reply: 15 s. */
  everyMs?: number;
  now?: () => number;
  /** A service turned a message down; for the terminal and Sync activity. Never holds a token. */
  onProblem?: (service: ChatService, problem: SlackProblem | DiscordProblem) => void;
  onError?: (error: unknown) => void;
}

/**
 * Claude's questions in Slack and Discord (spec 057, A): each waiting call goes to the services Settings ›
 * Notifications turns on, and your first good reply to a call with one question answers it, through the same
 * `respond()` as the Session screen. An approval only pings: nothing in chat ever allows a command (Q1).
 */
export interface ChatAnswersService {
  /** The session service's `onChange`: a call that wasn't waiting before is sent. */
  sessionChanged(before: Session, after: Session): void;
  /** The session service's `onReport`: a call answered in Orynx, or ended with its session, says so in chat. */
  reported(report: SessionReport): void;
  close(): Promise<void>;
}

const key = (session: string, approvalId: string) => `${session} ${approvalId}`;

function servicesFor(to: NotificationSettings['chatAnswers']['to']): ChatService[] {
  return to === 'both' ? ['slack', 'discord'] : [to];
}

function whereOf(session: Session): ChatWhere {
  return { ticket: session.source?.kind === 'jira' ? session.source.key : null, title: session.title };
}

/** The message a call gets, and the question a reply answers, if it has one. */
function messageFor(where: ChatWhere, approval: SessionApproval): { text: string; question: SessionQuestion | null } {
  if (approval.kind !== 'question') return { text: approvalPing(where), question: null };
  const [only, ...more] = approval.questions;
  if (only === undefined || more.length > 0) {
    return { text: severalQuestions(where, approval.questions.length), question: null };
  }
  return { text: questionMessage(where, only), question: only };
}

export function createChatAnswers(options: ChatAnswersOptions): ChatAnswersService {
  const { sessions, slack, discord } = options;
  const told = new Map<string, Told>();
  /** Discord: the last message read in the bot's DM, shared by every question there. */
  let discordAfter: string | null = null;
  let timer: NodeJS.Timeout | null = null;
  let reading = false;
  const inFlight = new Set<Promise<unknown>>();

  function safely(work: () => Promise<unknown>): void {
    const running = work()
      .catch((error: unknown) => options.onError?.(error))
      .finally(() => inFlight.delete(running));
    inFlight.add(running);
  }

  async function slackBot() {
    try {
      return await slack.connection.botCredentials();
    } catch {
      return null;
    }
  }

  async function discordBot() {
    const credentials = await discord.connection.credentials();
    return credentials?.ok === true ? { token: credentials.token, userId: credentials.saved.userId } : null;
  }

  /** Sends `text` to you in one service: what it sent, null when that service isn't set up, or `failed`. */
  async function deliver(service: ChatService, text: string): Promise<Sent | null | 'failed'> {
    if (service === 'slack') {
      const bot = await slackBot();
      if (bot === null) return null;
      const opened = await slack.client.openDm(bot.token, bot.userId);
      const posted = opened.ok ? await slack.client.sendDm(bot.token, opened.channel, text) : opened;
      if (!posted.ok) {
        options.onProblem?.('slack', posted.problem);
        return 'failed';
      }
      return opened.ok ? { service, channel: opened.channel, message: posted.ts, after: posted.ts } : 'failed';
    }
    const bot = await discordBot();
    if (bot === null) return null;
    const opened = await discord.client.openDm(bot.token, bot.userId);
    const posted = opened.ok ? await discord.client.sendDm(bot.token, opened.channel, text) : opened;
    if (!posted.ok) {
      options.onProblem?.('discord', posted.problem);
      return 'failed';
    }
    return opened.ok ? { service, channel: opened.channel, message: posted.id, after: posted.id } : 'failed';
  }

  /** What each desktop notification showed, so it can be shown again with a line asking again. */
  const shown = new Map<string, DesktopQuestion>();

  /**
   * Says `text` where `sent` went: in Slack's thread, as a Reply on Discord (to `replyTo`, else Orynx's message), or as
   * the desktop notification's title, shown again. Only asking again goes to the desktop.
   */
  async function say(sent: Sent, text: string, replyTo?: string): Promise<void> {
    if (sent.service === 'notification') {
      const question = shown.get(sent.message);
      if (question !== undefined && text !== chatWords.sent) options.desktop?.show({ ...question, title: text });
      return;
    }
    if (sent.service === 'slack') {
      const bot = await slackBot();
      if (bot !== null) await slack.client.sendDm(bot.token, sent.channel, text, sent.message);
      return;
    }
    const bot = await discordBot();
    if (bot !== null) await discord.client.sendDm(bot.token, sent.channel, text, replyTo ?? sent.message);
  }

  async function send(session: Session, approval: SessionApproval): Promise<void> {
    const settings = await options.settings.read();
    const { chatAnswers } = settings;
    if (!chatAnswers.on) return;
    const { text, question } = messageFor(whereOf(session), approval);
    const call: Told = { session: session.id, approvalId: approval.id, question, sent: [], answeredHere: false };
    told.set(key(session.id, approval.id), call);
    showOnDesktop(session, approval, settings, call);
    // Discord reads one DM for every question: from this one on, unless an earlier one still waits there.
    const readingDiscord = [...told.values()].some(
      (each) => each !== call && each.question !== null && each.sent.some((sent) => sent.service === 'discord'),
    );
    const unsent: ChatService[] = [];
    for (const service of servicesFor(chatAnswers.to)) {
      const sent = await deliver(service, text);
      if (sent === 'failed') unsent.push(service);
      if (sent === null || sent === 'failed') continue;
      call.sent.push(sent);
      if (service === 'discord' && question !== null && !readingDiscord) discordAfter = sent.message;
    }
    if (unsent.length > 0) await sessions.unsent(session.id, approval.id, unsent);
    if (question !== null && call.sent.some((sent) => sent.service !== 'notification')) start();
  }

  /** A question call in the desktop app, as Settings › Notifications lets a desktop notification through (AC-15). */
  function showOnDesktop(
    session: Session,
    approval: SessionApproval,
    settings: NotificationSettings,
    call: Told,
  ): void {
    if (options.desktop === undefined || approval.kind !== 'question') return;
    const what = {
      kind: 'approval' as const,
      session: { id: session.id, title: session.title, source: session.source },
      approvalId: approval.id,
      about: 'question' as const,
      command: null,
      waiting: true,
    };
    if (!delivery(what, settings, new Date(options.now?.() ?? Date.now())).desktop) return;
    const id = key(session.id, approval.id);
    const question: DesktopQuestion = {
      id,
      ...desktopQuestion(whereOf(session), approval.questions),
      path: `/sessions/${session.id}`,
      onlyInBackground: settings.onlyInBackground,
    };
    shown.set(id, question);
    options.desktop.show(question);
    call.sent.push({ service: 'notification', channel: '', message: id, after: id });
  }

  /** Your reply to `call`'s question: an answer or Skip goes to Claude, anything else is asked again. */
  async function take(call: Told, sent: Sent, text: string, replyTo: string): Promise<void> {
    if (call.question === null) return;
    const reply = readReply(call.question, text);
    if (reply.kind === 'again') {
      await say(sent, reply.text, replyTo);
      return;
    }
    call.answeredHere = true;
    const result =
      reply.kind === 'skip'
        ? await sessions.respond(call.session, call.approvalId, 'deny')
        : await sessions.respond(call.session, call.approvalId, { answers: [reply.answer] }, sent.service);
    if (result === 'answered') {
      told.delete(key(call.session, call.approvalId));
      await say(sent, chatWords.sent, replyTo);
      return;
    }
    call.answeredHere = false;
    if (result === 'bad_answer') await say(sent, chatWords.pickRange(call.question.options.length), replyTo);
  }

  async function readSlack(): Promise<void> {
    const open = [...told.values()].filter(
      (call) => call.question !== null && call.sent.some((s) => s.service === 'slack'),
    );
    if (open.length === 0) return;
    const bot = await slackBot();
    if (bot === null) return;
    for (const call of open) {
      const sent = call.sent.find((each) => each.service === 'slack');
      if (sent === undefined) continue;
      const read = await slack.client.repliesAfter(bot.token, sent.channel, sent.message, sent.after);
      if (!read.ok) continue;
      for (const reply of read.messages) {
        sent.after = reply.ts;
        if (reply.author !== bot.userId || !told.has(key(call.session, call.approvalId))) continue;
        await take(call, sent, reply.text, reply.ts);
      }
    }
  }

  async function readDiscord(): Promise<void> {
    const waitingThere = () =>
      [...told.values()].filter((call) => call.question !== null && call.sent.some((s) => s.service === 'discord'));
    const [first] = waitingThere();
    const channel = first?.sent.find((each) => each.service === 'discord')?.channel;
    if (channel === undefined || discordAfter === null) return;
    const bot = await discordBot();
    if (bot === null) return;
    const read = await discord.client.dmAfter(bot.token, channel, discordAfter);
    if (!read.ok) return;
    for (const message of read.messages) {
      discordAfter = message.id;
      if (message.author !== bot.userId) continue;
      const open = waitingThere();
      const call =
        message.replyTo === null
          ? open.length === 1
            ? open[0]
            : undefined
          : open.find((each) => each.sent.some((s) => s.service === 'discord' && s.message === message.replyTo));
      const sent = call?.sent.find((each) => each.service === 'discord');
      if (call !== undefined && sent !== undefined) {
        await take(call, sent, message.text, message.id);
        continue;
      }
      // A plain message with more than one question waiting there can't be told apart (AC-8).
      const somewhere = first?.sent.find((each) => each.service === 'discord');
      if (message.replyTo === null && open.length > 1 && somewhere !== undefined) {
        await say(somewhere, chatWords.useReply, message.id);
      }
    }
  }

  async function tick(): Promise<void> {
    if (reading) return;
    reading = true;
    try {
      await readSlack();
      await readDiscord();
    } finally {
      reading = false;
    }
    const threads = [...told.values()].some(
      (call) => call.question !== null && call.sent.some((sent) => sent.service !== 'notification'),
    );
    if (!threads) stop();
  }

  function start(): void {
    timer ??= setInterval(() => {
      safely(tick);
    }, options.everyMs ?? 15_000);
  }

  function stop(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  options.desktop?.onReply((id, text) => {
    const call = told.get(id);
    const sent = call?.sent.find((each) => each.service === 'notification');
    if (call !== undefined && sent !== undefined) safely(() => take(call, sent, text, id));
  });

  return {
    sessionChanged(before, after) {
      const was = new Set(before.approvals.map((approval) => approval.id));
      for (const approval of after.approvals) {
        if (was.has(approval.id) || told.has(key(after.id, approval.id))) continue;
        safely(() => send(after, approval));
      }
    },

    reported(report) {
      if (report.what !== 'answered') return;
      const call = told.get(key(report.session, report.approval));
      if (call === undefined) return;
      told.delete(key(report.session, report.approval));
      for (const sent of call.sent) {
        if (sent.service !== 'notification') continue;
        shown.delete(sent.message);
        options.desktop?.withdraw(sent.message);
      }
      if (call.answeredHere || call.question === null) return;
      const words = report.by === 'you' ? chatWords.answeredInOrynx : chatWords.stopped;
      for (const sent of call.sent) if (sent.service !== 'notification') safely(() => say(sent, words));
    },

    async close() {
      stop();
      await Promise.all(inFlight);
    },
  };
}
