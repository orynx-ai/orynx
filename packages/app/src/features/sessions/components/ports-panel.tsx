import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy01Icon, LinkSquare02Icon, RefreshIcon, StopIcon, TerminalIcon } from '@hugeicons/core-free-icons';
import { sessionPortsQueryKey } from '@devhub/api-client';
import type { Session, SessionPort } from '@devhub/contracts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
  Icon,
  IconButton,
  PortList,
  PortRow,
  PortRowSkeleton,
} from '@devhub/ui';
import { useApi } from '../../../api.tsx';
import { usePlatform } from '../../../platform.tsx';
import { useNow } from '../../../words/use-now.ts';
import { addressOf, portMeta, portWords } from '../port-words.ts';
import { useSessionPorts } from '../queries.ts';

/** One port's buttons: Open or Copy, Restart or Run again in Terminal, and Stop, which asks first for one Orynx didn't start. */
function PortActions({ session, port, onTyped }: { session: Session; port: SessionPort; onTyped: () => void }) {
  const api = useApi();
  const platform = usePlatform();
  const queryClient = useQueryClient();
  const address = addressOf(port);
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: sessionPortsQueryKey(session.id) });
  const stop = useMutation({ mutationFn: () => api.stopPort(session.id, port.port), onSettled: refresh });
  const restart = useMutation({ mutationFn: () => api.restartPort(session.id, port.port), onSettled: refresh });
  // A new Terminal tab with the command typed and not run, so you check it first (spec 042, AC-6).
  const runAgain = useMutation({
    mutationFn: async () => {
      const added = await api.addTerminalTab(session.id);
      if (added.result === 'added') await api.terminalInput(session.id, added.tabId, port.command);
    },
    onSuccess: onTyped,
  });
  const { url } = port;
  return (
    <>
      {url === null ? (
        <IconButton
          variant="ghost"
          size="sm"
          label={copied ? portWords.copied : portWords.copy(address)}
          onClick={() => {
            void navigator.clipboard.writeText(address).then(() => {
              setCopied(true);
            });
          }}
        >
          <Icon icon={Copy01Icon} aria-hidden />
        </IconButton>
      ) : (
        <IconButton asChild variant="ghost" size="sm" label={portWords.open(address)}>
          <a
            href={url}
            rel="noreferrer"
            onClick={(event) => {
              event.preventDefault();
              platform.openExternal(url);
            }}
          >
            <Icon icon={LinkSquare02Icon} aria-hidden />
          </a>
        </IconButton>
      )}
      {port.restartable ? (
        <IconButton
          variant="ghost"
          size="sm"
          label={portWords.restart(address)}
          pending={restart.isPending}
          onClick={() => {
            restart.mutate();
          }}
        >
          <Icon icon={RefreshIcon} aria-hidden />
        </IconButton>
      ) : port.startedBy === 'found' ? (
        <IconButton
          variant="ghost"
          size="sm"
          label={portWords.runAgain}
          pending={runAgain.isPending}
          onClick={() => {
            runAgain.mutate();
          }}
        >
          <Icon icon={TerminalIcon} aria-hidden />
        </IconButton>
      ) : null}
      <IconButton
        variant="ghost"
        size="sm"
        label={portWords.stop(address)}
        pending={stop.isPending}
        onClick={() => {
          // Orynx didn't start one it found, so it asks first (spec 042, Assumptions 4).
          if (port.startedBy === 'found') setAsking(true);
          else stop.mutate();
        }}
      >
        <Icon icon={StopIcon} aria-hidden />
      </IconButton>
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogTitle>{portWords.confirmTitle(address)}</AlertDialogTitle>
          <AlertDialogDescription>{portWords.confirmBody}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{portWords.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                stop.mutate();
              }}
            >
              {portWords.confirmStop}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * The Ports tab (spec 042): what listens from the session, read every 3 seconds while it's open, each port with its
 * buttons. Loading draws the rows' own chrome, so nothing moves when they arrive.
 */
export function PortsPanel({ session }: { session: Session }) {
  const ports = useSessionPorts(session, { open: true });
  const now = useNow();
  const [typed, setTyped] = useState(false);
  if (ports.isPending) {
    return (
      <PortList aria-label={portWords.list} aria-busy>
        <PortRowSkeleton />
        <PortRowSkeleton />
      </PortList>
    );
  }
  if (ports.isError) {
    return (
      <div className="flex items-center gap-2 text-small text-muted-foreground">
        <span>{portWords.unreadable}</span>
        <Button variant="ghost" size="sm" onClick={() => void ports.refetch()}>
          {portWords.tryAgain}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {ports.data.length === 0 ? (
        <p className="m-0 text-small text-muted-foreground">{portWords.empty}</p>
      ) : (
        <PortList aria-label={portWords.list}>
          {ports.data.map((port) => (
            <PortRow
              key={port.port}
              address={addressOf(port)}
              name={port.name ?? port.program}
              command={port.command}
              meta={portMeta(port, now)}
              actions={
                <PortActions
                  session={session}
                  port={port}
                  onTyped={() => {
                    setTyped(true);
                  }}
                />
              }
            />
          ))}
        </PortList>
      )}
      <p role="status" className="m-0 text-small text-muted-foreground">
        {typed ? portWords.typed : null}
      </p>
    </div>
  );
}
