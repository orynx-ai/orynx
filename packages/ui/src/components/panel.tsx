import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

export type PanelProps = Omit<ComponentProps<'section'>, 'title'> & {
  /** The panel's heading, for example "Needs your attention". With it, the panel is a named region. */
  title?: string | undefined;
  /** One quiet line beside the heading: "Sorted by how long it has waited". */
  meta?: ReactNode;
  /** The heading's level in the page's outline. */
  headingLevel?: 2 | 3 | 4;
};

/**
 * Design system: panel (`dh-panel`). A bordered `bg-raised` surface around a list, with an optional
 * head (heading and meta line). A tab strip inside it sits 16 px in from the edges. Panels never
 * hold another bordered box (Clean UI, "Cards don't hold cards").
 */
export function Panel({ title, meta, headingLevel = 2, className, children, ...props }: PanelProps) {
  const headingId = useId();
  const Heading = `h${String(headingLevel)}` as 'h2' | 'h3' | 'h4';
  const named = title !== undefined;

  // Without a title the section has no name, so it isn't announced as a region: a plain surface.
  return (
    <section
      data-slot="panel"
      aria-labelledby={named ? headingId : undefined}
      className={cn('overflow-hidden rounded-md border border-border bg-raised [&_[role=tablist]]:px-4', className)}
      {...props}
    >
      {named ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3.5">
          <Heading id={headingId} className="m-0 text-title font-medium">
            {title}
          </Heading>
          {meta ? <span className="text-small text-muted-foreground">{meta}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
