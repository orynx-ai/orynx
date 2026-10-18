import type { ComponentProps } from 'react';
import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';
import { Icon } from './icon.tsx';

const linkVariants = cva(
  'inline-flex items-center gap-1 rounded-xs text-info underline-offset-2 hover:bg-subtle hover:underline',
  {
    variants: {
      look: {
        /** On its own (Open in Jira, Create a token): underlined on hover, 24 px tall, its text where it stands. */
        standalone: '-mx-1 min-h-6 px-1 no-underline',
        /** In a sentence: underlined always, so it reads as a link beside text of the same colour (WCAG 1.4.1). */
        inline: 'underline',
      },
      size: { body: 'text-body', small: 'text-small', inherit: '' },
    },
    defaultVariants: { look: 'standalone', size: 'small' },
  },
);

export type ExternalLinkProps = Omit<ComponentProps<'a'>, 'href' | 'onClick'> &
  VariantProps<typeof linkVariants> & {
    /** Where it goes: an http or https address outside Orynx. */
    href: string;
    /** Opens it outside Orynx: the host's `Platform.openExternal`. */
    onOpen: (href: string) => void;
  };

/**
 * A link that leaves Orynx (the user's call, 18 Oct 2026): its text, then the arrow `ArrowUpRight01Icon` that
 * says it opens elsewhere; on hover the `bg-subtle` highlight and an underline. Every external link is one, so
 * they all look and behave the same. It opens through `onOpen`, never in the page.
 */
export function ExternalLink({ href, onOpen, look, size, className, children, ...props }: ExternalLinkProps) {
  return (
    <a
      data-slot="external-link"
      href={href}
      rel="noreferrer"
      onClick={(event) => {
        event.preventDefault();
        onOpen(href);
      }}
      className={cn(linkVariants({ look, size }), className)}
      {...props}
    >
      {children}
      <Icon icon={ArrowUpRight01Icon} aria-hidden className={size === 'body' ? 'size-4' : 'size-3.5'} />
    </a>
  );
}
