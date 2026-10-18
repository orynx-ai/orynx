/**
 * Turns a Jira description, which Jira stores in Atlassian's document format (ADF), into the Markdown
 * Claude reads in the brief (spec 011). It walks the document by hand, so there's no dependency: the
 * nodes a description usually holds get their Markdown, and anything else keeps only its text. It never
 * throws, because a description is outside data.
 */

interface AdfNode {
  type?: unknown;
  text?: unknown;
  attrs?: unknown;
  marks?: unknown;
  content?: unknown;
}

function isNode(value: unknown): value is AdfNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function childrenOf(node: AdfNode): AdfNode[] {
  return Array.isArray(node.content) ? node.content.filter(isNode) : [];
}

function attr(node: AdfNode, name: string): unknown {
  return isNode(node.attrs) ? (node.attrs as Record<string, unknown>)[name] : undefined;
}

function stringAttr(node: AdfNode, name: string): string | undefined {
  const value = attr(node, name);
  return typeof value === 'string' ? value : undefined;
}

/** A description: null when it has no text at all. */
export function adfToMarkdown(description: unknown): string | null {
  if (typeof description === 'string') return description.trim() === '' ? null : description;
  if (!isNode(description)) return null;
  const markdown = blocks(childrenOf(description)).trim();
  return markdown === '' ? null : markdown;
}

/** Block nodes, a blank line apart; blocks with no text are left out. */
function blocks(nodes: readonly AdfNode[]): string {
  return nodes
    .map(block)
    .filter((part) => part.trim() !== '')
    .join('\n\n');
}

function block(node: AdfNode): string {
  switch (node.type) {
    case 'paragraph':
      return inline(childrenOf(node));
    case 'heading': {
      const level = attr(node, 'level');
      const hashes = '#'.repeat(typeof level === 'number' && level >= 1 && level <= 6 ? level : 1);
      return `${hashes} ${inline(childrenOf(node))}`;
    }
    case 'bulletList':
    case 'orderedList':
      return list(node);
    case 'taskList':
      return childrenOf(node)
        .map((task) => `- [${stringAttr(task, 'state') === 'DONE' ? 'x' : ' '}] ${inline(childrenOf(task))}`)
        .join('\n');
    case 'codeBlock': {
      const language = stringAttr(node, 'language') ?? '';
      return `\`\`\`${language}\n${plainText(node)}\n\`\`\``;
    }
    case 'blockquote':
    case 'panel':
      return quote(blocks(childrenOf(node)));
    case 'rule':
      return '---';
    case 'table':
      return table(node);
    case 'expand':
    case 'nestedExpand': {
      const title = stringAttr(node, 'title');
      const body = blocks(childrenOf(node));
      return title ? `**${title}**\n\n${body}` : body;
    }
    default:
      // A node this file doesn't know: its blocks if it holds blocks, else its text.
      return childrenOf(node).some(isBlockish) ? blocks(childrenOf(node)) : inline(childrenOf(node));
  }
}

const blockTypes = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'taskList',
  'codeBlock',
  'blockquote',
  'panel',
  'rule',
  'table',
  'expand',
  'nestedExpand',
  'mediaSingle',
  'mediaGroup',
]);

function isBlockish(node: AdfNode): boolean {
  return typeof node.type === 'string' && (blockTypes.has(node.type) || Array.isArray(node.content));
}

function list(node: AdfNode): string {
  const ordered = node.type === 'orderedList';
  const order = attr(node, 'order');
  const start = typeof order === 'number' && Number.isInteger(order) ? order : 1;
  return childrenOf(node)
    .map((item, index) => {
      const marker = ordered ? `${String(start + index)}. ` : '- ';
      const parts = childrenOf(item).map((child) =>
        child.type === 'bulletList' || child.type === 'orderedList' ? list(child) : block(child),
      );
      const [first = '', ...rest] = parts.filter((part) => part.trim() !== '');
      // Lines under the item line up with its text, so nested lists stay nested.
      const indent = ' '.repeat(marker.length);
      const body = [first, ...rest].join('\n').split('\n');
      return [`${marker}${body[0] ?? ''}`, ...body.slice(1).map((line) => (line === '' ? '' : indent + line))].join(
        '\n',
      );
    })
    .join('\n');
}

function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');
}

function table(node: AdfNode): string {
  const rows = childrenOf(node).filter((row) => row.type === 'tableRow');
  const lines = rows.map(
    (row) =>
      `| ${childrenOf(row)
        .map((cell) => blocks(childrenOf(cell)).replace(/\n+/g, ' ').replace(/\|/g, '\\|'))
        .join(' | ')} |`,
  );
  const first = rows[0];
  if (first && childrenOf(first).every((cell) => cell.type === 'tableHeader')) {
    lines.splice(
      1,
      0,
      `| ${childrenOf(first)
        .map(() => '---')
        .join(' | ')} |`,
    );
  }
  return lines.join('\n');
}

/** Inline nodes, side by side. */
function inline(nodes: readonly AdfNode[]): string {
  return nodes.map(inlineNode).join('');
}

function inlineNode(node: AdfNode): string {
  switch (node.type) {
    case 'text':
      return typeof node.text === 'string' ? withMarks(node.text, node.marks) : '';
    case 'hardBreak':
      return '\n';
    case 'mention':
      return stringAttr(node, 'text') ?? '';
    case 'emoji':
      return stringAttr(node, 'text') ?? stringAttr(node, 'shortName') ?? '';
    case 'inlineCard':
    case 'blockCard':
    case 'embedCard':
      return stringAttr(node, 'url') ?? '';
    case 'status':
      return stringAttr(node, 'text') ?? '';
    case 'date': {
      const timestamp = Number(attr(node, 'timestamp'));
      return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : '';
    }
    default:
      return inline(childrenOf(node));
  }
}

/** Code first, then bold, italics and strike, with the link outside; spaces stay outside the marks. */
function withMarks(text: string, marks: unknown): string {
  if (!Array.isArray(marks) || marks.length === 0) return text;
  const lead = /^\s*/.exec(text)?.[0] ?? '';
  const trail = /\s*$/.exec(text)?.[0] ?? '';
  let core = text.slice(lead.length, text.length - trail.length);
  if (core === '') return text;
  const kinds = marks.filter(isNode);
  const has = (type: string) => kinds.some((mark) => mark.type === type);
  if (has('code')) core = `\`${core}\``;
  if (has('strike')) core = `~~${core}~~`;
  if (has('em')) core = `*${core}*`;
  if (has('strong')) core = `**${core}**`;
  const link = kinds.find((mark) => mark.type === 'link');
  const href = link ? stringAttr(link, 'href') : undefined;
  if (href) core = `[${core}](${href})`;
  return `${lead}${core}${trail}`;
}

/** Every piece of text under a node, as it is: for code, where Markdown must not change a thing. */
function plainText(node: AdfNode): string {
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
  if (node.type === 'hardBreak') return '\n';
  return childrenOf(node).map(plainText).join('');
}
