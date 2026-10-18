import { useId, type ComponentProps, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';

const cardVariants = cva('flex flex-col gap-2 rounded-md p-3', {
  variants: {
    look: {
      plain: 'border border-border bg-raised',
      // The one in use, as Settings › Coding agent draws Claude: the 2 px info border, without ChoiceCard's wash.
      selected: 'border-2 border-info bg-raised',
      // Something still to come, as "More agents" is: dashed, on the sidebar's colour.
      placeholder: 'border border-dashed border-border bg-sidebar',
    },
  },
  defaultVariants: { look: 'plain' },
});

export type CardLook = NonNullable<VariantProps<typeof cardVariants>['look']>;

export type CardProps = Omit<ComponentProps<'div'>, 'title'> &
  VariantProps<typeof cardVariants> & {
    /** The card's heading, for example "Claude". It names the card. */
    title: string;
    /** What sits beside the title, on the right: a pill that says the card's state. */
    aside?: ReactNode;
    /** The heading's level in the page's outline. */
    headingLevel?: 2 | 3 | 4;
  };

const headings = { 2: 'h2', 3: 'h3', 4: 'h4' } as const;

/**
 * Design system: card (`dh-card`, `dh-card-top`). A small surface with a title, an optional pill beside
 * it, and a few lines below, such as the agent cards on Settings › Coding agent (spec 010, Q4). It isn't
 * a choice: when there are several agents to pick from, they become a `ChoiceGroup`. Cards never hold
 * another bordered box (Clean UI).
 */
export function Card({ title, aside, look, headingLevel = 2, className, children, ...props }: CardProps) {
  const headingId = useId();
  const Heading = headings[headingLevel];
  return (
    <div
      data-slot="card"
      role="group"
      aria-labelledby={headingId}
      className={cn(cardVariants({ look }), className)}
      {...props}
    >
      {/* 24 px tall, the pill's height, so a card with a pill and one without line up. */}
      <div className="flex min-h-6 items-center gap-2">
        <Heading id={headingId} className="m-0 text-body font-medium">
          {title}
        </Heading>
        {aside === undefined ? null : <div className="ms-auto flex items-center">{aside}</div>}
      </div>
      {children}
    </div>
  );
}
