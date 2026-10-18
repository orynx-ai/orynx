import { useMemo, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/cn.ts';
import { ExternalLink } from './external-link.tsx';
import {
  parseMarkdown,
  safeLink,
  type Block,
  type HeadingLevel,
  type Inline,
  type ListItem,
} from './markdown-blocks.ts';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from './table.tsx';

export type MarkdownProps = Omit<ComponentProps<'div'>, 'children'> & {
  /** Markdown as Orynx's Jira converter writes it: a ticket's description (spec 013, Q8). */
  text: string;
  /** Opens an `http` or `https` link outside Orynx. Any other link shows as its text. */
  onOpenLink: (url: string) => void;
  /** The level the text's largest heading gets, so the page's outline never skips one; 3 by default. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
};

interface Context {
  onOpenLink: (url: string) => void;
  /** Turns the text's own heading level into the page's. */
  levelOf: (level: HeadingLevel) => HeadingLevel;
}

/** Lines have no ids of their own; for a given text their order is fixed. */
function inlines(nodes: readonly Inline[], ctx: Context): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case 'text':
        return node.text;
      case 'break':
        return <br key={index} />;
      case 'code':
        return (
          <code key={index} className="rounded-xs bg-subtle px-1 font-mono text-code">
            {node.text}
          </code>
        );
      case 'strong':
        return (
          <strong key={index} className="font-medium">
            {inlines(node.inline, ctx)}
          </strong>
        );
      case 'em':
        return <em key={index}>{inlines(node.inline, ctx)}</em>;
      case 'strike':
        return <s key={index}>{inlines(node.inline, ctx)}</s>;
      case 'link': {
        const href = safeLink(node.href);
        if (href === null) return <span key={index}>{inlines(node.inline, ctx)}</span>;
        return (
          <ExternalLink key={index} look="inline" size="inherit" href={href} onOpen={ctx.onOpenLink}>
            {inlines(node.inline, ctx)}
          </ExternalLink>
        );
      }
    }
  });
}

function TaskItem({ item, ctx }: { item: ListItem & { checked: boolean }; ctx: Context }) {
  return (
    <li>
      {/* A read-only box, labelled by the item, so its state is heard as a checkbox's. */}
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={item.checked}
          disabled
          readOnly
          className="m-0 mt-1 size-4 shrink-0 accent-info"
        />
        <span className="min-w-0">{inlines(item.inline, ctx)}</span>
      </label>
      {item.blocks.length > 0 ? <div className="mt-1 flex flex-col gap-1 ps-6">{blocks(item.blocks, ctx)}</div> : null}
    </li>
  );
}

function List({ block, ctx }: { block: Extract<Block, { kind: 'list' }>; ctx: Context }) {
  const tasks = block.items.every((item) => item.checked !== null);
  const items = block.items.map((item, index) =>
    item.checked === null ? (
      // A list item keeps its own display, or its bullet or number goes.
      <li key={index} className="ps-1">
        {inlines(item.inline, ctx)}
        {item.blocks.length > 0 ? <div className="mt-1 flex flex-col gap-1">{blocks(item.blocks, ctx)}</div> : null}
      </li>
    ) : (
      <TaskItem key={index} item={{ ...item, checked: item.checked }} ctx={ctx} />
    ),
  );
  const shape = tasks ? 'list-none ps-0' : block.ordered ? 'list-decimal ps-6' : 'list-disc ps-6';
  const className = cn('m-0 flex flex-col gap-1', shape);
  return block.ordered ? (
    <ol className={className} start={block.start}>
      {items}
    </ol>
  ) : (
    <ul className={className}>{items}</ul>
  );
}

function blocks(nodes: readonly Block[], ctx: Context): ReactNode[] {
  return nodes.map((block, index) => {
    switch (block.kind) {
      case 'paragraph':
        return (
          <p key={index} className="m-0">
            {inlines(block.inline, ctx)}
          </p>
        );
      case 'heading': {
        const Heading = `h${String(ctx.levelOf(block.level))}` as 'h3';
        return (
          <Heading key={index} className="m-0 text-body font-medium">
            {inlines(block.inline, ctx)}
          </Heading>
        );
      }
      case 'list':
        return <List key={index} block={block} ctx={ctx} />;
      case 'code':
        return (
          <pre
            key={index}
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling box must take focus to scroll by keyboard (WCAG 2.1.1)
            tabIndex={0}
            className="m-0 overflow-x-auto rounded-md border border-border bg-sidebar px-3 py-2 font-mono text-code focus-visible:-outline-offset-2"
          >
            <code>{block.text}</code>
          </pre>
        );
      case 'quote':
        return (
          <blockquote
            key={index}
            className="m-0 flex flex-col gap-3 border-s-2 border-border ps-3 text-muted-foreground"
          >
            {blocks(block.blocks, ctx)}
          </blockquote>
        );
      case 'rule':
        return <hr key={index} className="m-0 border-0 border-t border-border" />;
      case 'table':
        return (
          <div
            key={index}
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling box must take focus to scroll by keyboard (axe: scrollable-region-focusable)
            tabIndex={0}
            className="relative overflow-x-auto rounded-md border border-border focus-visible:-outline-offset-2"
          >
            <table className="w-full border-collapse text-small text-muted-foreground">
              {block.header === null ? null : (
                <TableHeader>
                  <TableRow>
                    {block.header.map((cell, column) => (
                      <TableHead key={column}>{inlines(cell, ctx)}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
              )}
              <TableBody className={block.header === null ? '[&>tr:first-child]:border-t-0' : undefined}>
                {block.rows.map((row, line) => (
                  <TableRow key={line}>
                    {row.map((cell, column) => (
                      <TableCell key={column}>{inlines(cell, ctx)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>
        );
    }
  });
}

/** The largest heading in the text, quotes and list items included. */
function topLevel(nodes: readonly Block[]): number {
  return Math.min(
    7,
    ...nodes.map((block) => {
      if (block.kind === 'heading') return block.level;
      if (block.kind === 'quote') return topLevel(block.blocks);
      if (block.kind === 'list') return Math.min(7, ...block.items.map((item) => topLevel(item.blocks)));
      return 7;
    }),
  );
}

/**
 * A ticket's description, laid out (spec 013, Q8): what Orynx's Jira converter writes, in the five sizes and
 * two weights. Text in 16/24, headings at the same size in 500, code in mono. HTML and anything it doesn't know
 * show as plain text. Links open outside Orynx through `onOpenLink`, and only `http` and `https` ones are
 * links (AC-10). A wide code block or table scrolls inside its own box, which takes keyboard focus for it.
 */
export function Markdown({ text, onOpenLink, headingLevel = 3, className, ...props }: MarkdownProps) {
  const parsed = useMemo(() => parseMarkdown(text), [text]);
  const top = topLevel(parsed);
  const ctx: Context = {
    onOpenLink,
    levelOf: (level) => Math.min(6, headingLevel + level - top) as HeadingLevel,
  };
  return (
    <div
      data-slot="markdown"
      className={cn('flex min-w-0 flex-col gap-3 text-body text-foreground', className)}
      {...props}
    >
      {blocks(parsed, ctx)}
    </div>
  );
}
