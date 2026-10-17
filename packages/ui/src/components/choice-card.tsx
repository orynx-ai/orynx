import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

export interface ChoiceCardProps extends Omit<ComponentProps<'input'>, 'type' | 'title'> {
  /** The choice in a few words; it names the radio. */
  title: string;
  /** One line under the title that says what picking it means; it describes the radio. */
  detail?: ReactNode;
}

/**
 * Design system: Choice card (`dh-choice`, "radio as a card"). A native radio with a title and a
 * detail line; the whole card picks it. Put the cards of one choice inside `<ChoiceGroup>`, which
 * names them and gives arrow-key movement for free. The checked card takes the `info` border and wash.
 */
export function ChoiceCard({ title, detail, className, id, ...props }: ChoiceCardProps) {
  const madeUpId = useId();
  const radioId = id ?? `${madeUpId}-radio`;
  const titleId = `${radioId}-title`;
  const detailId = `${radioId}-detail`;
  const hasDetail = detail !== undefined && detail !== null && detail !== false && detail !== '';

  return (
    <label
      htmlFor={radioId}
      className={cn(
        'flex min-h-14 cursor-pointer items-start gap-3 rounded-md border border-border bg-raised p-4 has-checked:border-info has-checked:bg-info-subtle',
        className,
      )}
    >
      {/* Named by the title alone: the card wraps the detail line too, which describes it instead.
          2 px down, so the 20 px radio sits on the title's 24 px line. */}
      <input
        type="radio"
        id={radioId}
        aria-labelledby={titleId}
        aria-describedby={hasDetail ? detailId : undefined}
        className="m-0 mt-0.5 size-5 shrink-0 accent-info"
        {...props}
      />
      <span className="flex min-w-0 flex-col gap-1">
        <span id={titleId}>{title}</span>
        {hasDetail ? (
          <span id={detailId} className="text-small text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </span>
    </label>
  );
}
