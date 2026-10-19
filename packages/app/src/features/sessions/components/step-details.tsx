import type { ReactNode } from 'react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { useNavigate } from '@tanstack/react-router';
import type { Session, SessionActivity } from '@devhub/contracts';
import {
  AttentionList,
  Button,
  CalloutCode,
  CopyButton,
  Dialog,
  DialogContent,
  DialogTitle,
  Icon,
  IconButton,
  Markdown,
  Skeleton,
} from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { useSessionBrief } from '../queries.ts';
import { stepDetailWords as words, stepWords } from '../step-words.ts';

/** The steps whose title opens them in full: there's more to them than their one line (the user's call, 19 Oct 2026). */
export function hasDetails(activity: SessionActivity): boolean {
  switch (activity.kind) {
    case 'brief':
    case 'message':
      return true;
    case 'explore':
    case 'edit':
      return activity.files.length > 0;
    case 'plan':
      return activity.items.length > 0;
    case 'command':
      return activity.commands.length > 0;
    case 'finished':
      return activity.summary.trim() !== '';
    default:
      return false;
  }
}

/** Each path in full, in mono, with its copy button; an edited file's opens its diff in the Changes tab. */
function Paths({ files, onShow }: { files: readonly string[]; onShow?: ((path: string) => void) | undefined }) {
  return (
    <AttentionList>
      {files.map((path) => (
        <li key={path} className="group flex min-h-10 items-center gap-2 py-1">
          {onShow === undefined ? (
            <span title={path} className="min-w-0 flex-1 truncate font-mono text-code">
              {path}
            </span>
          ) : (
            <button
              type="button"
              title={words.showChanges(path)}
              onClick={() => {
                onShow(path);
              }}
              className="min-w-0 flex-1 cursor-pointer truncate rounded-xs border-0 bg-transparent p-0 text-start font-mono text-code text-foreground hover:underline"
            >
              {path}
            </button>
          )}
          <CopyButton text={path} reveal="hover" />
        </li>
      ))}
    </AttentionList>
  );
}

/** Exactly what Orynx sent Claude at the start, laid out as Markdown, as the server saved it. */
function Brief({ sessionId }: { sessionId: string }) {
  const platform = usePlatform();
  const brief = useSessionBrief(sessionId);
  if (brief.isPending) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">Loading</span>
        {['w-3/4', 'w-1/2', 'w-2/3'].map((width) => (
          <span key={width} aria-hidden className="flex h-6 items-center">
            <Skeleton className={`h-4 ${width}`} />
          </span>
        ))}
      </div>
    );
  }
  if (brief.isError) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <span role="alert">{words.briefFailed}</span>
        <Button variant="ghost" size="sm" onClick={() => void brief.refetch()}>
          {words.tryAgain}
        </Button>
      </div>
    );
  }
  if (brief.data.text === null) return <p className="m-0 text-muted-foreground">{words.briefNone}</p>;
  return (
    <Markdown
      text={brief.data.text}
      onOpenLink={(url) => {
        platform.openExternal(url);
      }}
    />
  );
}

function Body({ session, activity, onClose }: { session: Session; activity: SessionActivity; onClose: () => void }) {
  const platform = usePlatform();
  const navigate = useNavigate({ from: '/sessions/$sessionId' });
  switch (activity.kind) {
    case 'brief':
      return <Brief sessionId={session.id} />;
    case 'explore':
      return <Paths files={activity.files} />;
    case 'edit':
      return (
        <Paths
          files={activity.files}
          onShow={(path) => {
            onClose();
            void navigate({ search: (search) => ({ ...search, tab: undefined, file: path }), replace: true });
          }}
        />
      );
    case 'plan':
      return (
        <ol className="m-0 flex flex-col gap-2 ps-5">
          {activity.items.map((item, index) => (
            // The plan's items can repeat; their order is fixed.
            <li key={index}>{item}</li>
          ))}
        </ol>
      );
    case 'command':
      return (
        <div className="flex flex-col gap-2">
          {activity.commands.map((command, index) => (
            // The same command can run twice; their order is fixed.
            <CalloutCode key={index}>{command}</CalloutCode>
          ))}
        </div>
      );
    case 'finished':
      return (
        <Markdown
          text={activity.summary}
          onOpenLink={(url) => {
            platform.openExternal(url);
          }}
        />
      );
    case 'message':
      return <p className="m-0 whitespace-pre-wrap">{activity.text}</p>;
    default:
      return null;
  }
}

/**
 * A step of Claude's progress in full (the user's call, 19 Oct 2026): what Claude was sent, every file it read or
 * edited (each with its copy button, an edited one opening its diff), its plan, each command as code, its whole
 * summary, or your whole message. Esc or Close closes it, and focus goes back to the step.
 */
export function StepDetails({
  session,
  activity,
  onClose,
}: {
  session: Session;
  /** The step shown; null while none is. */
  activity: SessionActivity | null;
  onClose: () => void;
}) {
  let title: ReactNode = null;
  if (activity !== null) title = activity.kind === 'brief' ? words.briefTitle : stepWords(activity).title;
  return (
    <Dialog
      open={activity !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {activity === null ? null : (
        <DialogContent
          onOpenAutoFocus={(event) => {
            // Focus on the dialog, not on Close: Close's tooltip would take the first Esc, as the full-screen view's.
            event.preventDefault();
            if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
          }}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-6 py-3">
            <DialogTitle className="min-w-0 flex-1 truncate">{title}</DialogTitle>
            <IconButton variant="ghost" size="sm" label={words.close} onClick={onClose}>
              <Icon icon={Cancel01Icon} aria-hidden />
            </IconButton>
          </div>
          <div className="min-h-0 overflow-y-auto px-6 py-4">
            <Body session={session} activity={activity} onClose={onClose} />
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
