import { useNavigate } from '@tanstack/react-router';
import type { Session, SessionActivity } from '@devhub/contracts';
import { Cancel01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import {
  ActivityChecklist,
  AttentionList,
  Button,
  CalloutCode,
  CopyButton,
  Icon,
  Markdown,
  Skeleton,
} from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { useSessionBrief } from '../queries.ts';
import { stepDetailWords as words, stepWords } from '../step-words.ts';

/**
 * The steps whose title opens them in place: there's more to them than their one line (the user's call, 19 Oct 2026).
 * Finished doesn't: its summary already shows in full under its title (spec 046, Q3).
 */
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

/**
 * A step in full, under its title once it's open (spec 046, Q3): what Claude was sent, every file it read or edited
 * (each with its copy button, an edited one opening its diff), its plan, each command as code, or your whole message.
 */
export function StepDetails({ session, activity }: { session: Session; activity: SessionActivity }) {
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
            void navigate({ search: (search) => ({ ...search, tab: undefined, file: path }), replace: true });
          }}
        />
      );
    case 'plan':
      return (
        <ActivityChecklist
          aria-label={stepWords(activity).title}
          // Marks by place; a plan saved before spec 046 has none (AC-14).
          items={activity.items.map((text, index) => ({ text, status: activity.statuses?.[index] }))}
        />
      );
    case 'command':
      return (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {activity.commands.map((command, index) => {
            // A tick or a × once it has ended (spec 046, AC-12); none while it runs, or for a step saved before.
            const failed = activity.calls?.[index]?.failed ?? null;
            return (
              // The same command can run twice; their order is fixed.
              <li key={index} className="flex items-start gap-2">
                <CalloutCode className="min-w-0 flex-1">{command}</CalloutCode>
                {failed === null ? null : (
                  <Icon
                    icon={failed ? Cancel01Icon : Tick02Icon}
                    aria-hidden
                    className={failed ? 'mt-2 size-4 shrink-0 text-danger' : 'mt-2 size-4 shrink-0 text-success'}
                  />
                )}
                {failed === true ? <span className="sr-only">{words.failed}</span> : null}
              </li>
            );
          })}
        </ul>
      );
    case 'message':
      return <p className="m-0 whitespace-pre-wrap">{activity.text}</p>;
    default:
      return null;
  }
}
