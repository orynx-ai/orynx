// Stands in for `codex app-server` in the e2e run (spec 052), speaking its JSON-RPC over stdio, one message per line,
// with no `jsonrpc` field. It's signed in with ChatGPT and offers one model. A session's turn plans, asks before
// `npm test`, runs it only when Orynx accepts, and finishes; an ephemeral thread is Orynx asking for text, and gets a
// pull request's title and body. It never runs a command and never reaches OpenAI. Run by Node, which strips the types.
import { createInterface } from 'node:readline';

interface Message {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
}

const send = (message: Message) => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};
const notify = (method: string, params: Record<string, unknown>) => {
  send({ method, params });
};

let nextId = 9000;
const waiting = new Map<number | string, (result: unknown) => void>();
/** Asks Orynx, as Codex's server requests do, and gives its answer. */
const ask = (method: string, params: Record<string, unknown>) =>
  new Promise<unknown>((resolve) => {
    const id = nextId++;
    waiting.set(id, resolve);
    send({ id, method, params });
  });

const threadId = 'thread-e2e';
const turnId = 'turn-1';
let writing = false;

async function play(): Promise<void> {
  const item = (fields: Record<string, unknown>) => ({ threadId, turnId, item: fields });
  if (writing) {
    notify('item/completed', item({ type: 'agentMessage', id: 'm-1', text: 'Add a CSV export\n\nAdds the export.' }));
    notify('turn/completed', { threadId, turn: { id: turnId, status: 'completed' } });
    return;
  }
  notify('turn/plan/updated', { threadId, turnId, plan: [{ step: 'Run the tests', status: 'inProgress' }] });
  const answer = (await ask('item/commandExecution/requestApproval', {
    kind: 'command',
    threadId,
    turnId,
    itemId: 'cmd-1',
    startedAtMs: 0,
    command: 'npm test',
    cwd: '.',
    commandActions: [],
    reason: null,
  })) as { decision?: string } | undefined;
  if (answer?.decision === 'accept') {
    const run = { type: 'commandExecution', id: 'cmd-1', command: 'npm test', cwd: '.', commandActions: [] };
    notify('item/started', item({ ...run, status: 'inProgress' }));
    notify(
      'item/completed',
      item({ ...run, status: 'completed', aggregatedOutput: '1 passing', exitCode: 0, durationMs: 120 }),
    );
  }
  notify('item/completed', item({ type: 'agentMessage', id: 'm-2', text: 'Ran the tests: 1 passing.' }));
  notify('turn/completed', { threadId, turn: { id: turnId, status: 'completed' } });
}

function answer(id: number | string, method: string, params: Record<string, unknown>): void {
  const reply = (result: unknown) => {
    send({ id, result });
  };
  switch (method) {
    case 'initialize':
    case 'turn/interrupt':
      reply({});
      if (method === 'turn/interrupt')
        notify('turn/completed', { threadId, turn: { id: turnId, status: 'interrupted' } });
      return;
    case 'account/read':
      reply({ account: { type: 'chatgpt', email: 'e2e@company.example', planType: 'team' }, requiresOpenaiAuth: true });
      return;
    case 'model/list':
      reply({
        data: [
          {
            model: 'gpt-5.5-codex',
            displayName: 'GPT-5.5 Codex',
            description: 'Best for coding',
            hidden: false,
            supportedReasoningEfforts: [{ reasoningEffort: 'high', description: '' }],
          },
        ],
        nextCursor: null,
      });
      return;
    case 'config/read':
      reply({ config: {}, origins: {} });
      return;
    case 'thread/start':
    case 'thread/resume':
      writing = params['ephemeral'] === true;
      reply({ thread: { id: threadId } });
      return;
    case 'turn/start':
      reply({ turn: { id: turnId, status: 'inProgress' } });
      void play();
      return;
    default:
      send({ id, error: { code: -32601, message: `The fake Codex takes no ${method}` } } as Message);
  }
}

createInterface({ input: process.stdin }).on('line', (line) => {
  if (line.trim() === '') return;
  const message = JSON.parse(line) as Message;
  if (message.method !== undefined && message.id !== undefined)
    answer(message.id, message.method, message.params ?? {});
  else if (message.method === undefined && message.id !== undefined) {
    waiting.get(message.id)?.(message.result);
    waiting.delete(message.id);
  }
});
process.stdin.on('end', () => process.exit(0));
