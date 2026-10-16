import { Button, cn } from '@devhub/ui';

/** The one line shown when GET /api/sessions fails, with a way to try again (spec 001, Q7). */
export function SessionsLoadError({ onRetry, className }: { onRetry: () => void; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 text-small text-muted-foreground', className)}>
      <span>Couldn&apos;t load sessions</span>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
