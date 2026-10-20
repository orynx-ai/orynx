import { spawn, type ChildProcess } from 'node:child_process';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

/** The name devices on your wifi open Orynx at (spec 040). */
export const lanHost = 'orynx.local';

/** This computer's IPv4 address on the wifi (or a cable): en*, eth* and wl* before VPN and VM bridges. */
export function lanAddress(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()): string | undefined {
  const candidates = Object.entries(interfaces).flatMap(([device, infos]) =>
    (infos ?? []).filter((info) => info.family === 'IPv4' && !info.internal).map((info) => ({ device, ...info })),
  );
  // shortcut: one address; a computer on wifi and a cable at once announces only the first. Announce each if that matters.
  return (candidates.find((info) => /^(en|eth|wl)/.test(info.device)) ?? candidates[0])?.address;
}

/** The OS's own mDNS tool, which answers `orynx.local` with that address while it runs. */
export function announceCommand(platform: NodeJS.Platform, address: string): [string, string[]] | undefined {
  if (platform === 'darwin')
    return ['/usr/bin/dns-sd', ['-P', 'Orynx', '_https._tcp', 'local', '443', lanHost, address]];
  if (platform === 'linux') return ['/usr/bin/avahi-publish', ['--address', '--no-reverse', lanHost, address]];
  return undefined;
}

/** Announces orynx.local on the wifi, again whenever the address changes. Returns stop. */
export function announce(options: { platform: NodeJS.Platform; log: { warn(message: string): void } }): () => void {
  let child: ChildProcess | undefined;
  let announced: string | undefined;
  const refresh = (): void => {
    const address = lanAddress();
    if (address === announced) return;
    child?.kill();
    child = undefined;
    announced = address;
    if (address === undefined) {
      options.log.warn(`This computer has no network address, so ${lanHost} answers nothing until it joins a wifi.`);
      return;
    }
    const command = announceCommand(options.platform, address);
    if (command === undefined) {
      options.log.warn(
        `Orynx can't announce ${lanHost} on ${options.platform}, so other devices can't find it by name.`,
      );
      return;
    }
    const started = spawn(command[0], command[1], { stdio: 'ignore' });
    child = started;
    started.on('error', (error) => {
      options.log.warn(`Orynx couldn't announce ${lanHost} (${error.message}). On Linux, install avahi-utils.`);
    });
    started.on('exit', () => {
      if (child !== started) return;
      // It stopped on its own, as when another computer here holds the name: try again on the next check.
      options.log.warn(`${lanHost} stopped answering. Is another computer on this wifi running Orynx?`);
      child = undefined;
      announced = undefined;
    });
  };
  refresh();
  // A wifi can hand out a new address at any time.
  const timer = setInterval(refresh, 30_000);
  timer.unref();
  return () => {
    clearInterval(timer);
    child?.kill();
    child = undefined;
  };
}
