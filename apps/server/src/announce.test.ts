import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { announceCommand, lanAddress } from './announce.ts';

const ipv4 = (address: string, internal = false): NetworkInterfaceInfo => ({
  address,
  netmask: '255.255.255.0',
  family: 'IPv4',
  mac: '00:00:00:00:00:00',
  internal,
  cidr: null,
});

describe('lanAddress', () => {
  it('040 AC-2: picks the wifi’s address over loopback, VM bridges and VPNs', () => {
    expect(
      lanAddress({
        lo0: [ipv4('127.0.0.1', true)],
        bridge100: [ipv4('192.168.64.1')],
        utun4: [ipv4('100.64.0.2')],
        en0: [{ ...ipv4('fe80::1'), family: 'IPv6', scopeid: 4 }, ipv4('192.168.1.20')],
      }),
    ).toBe('192.168.1.20');
  });

  it('takes any outside address when there is no wifi or cable, and none when offline', () => {
    expect(lanAddress({ lo0: [ipv4('127.0.0.1', true)], bridge100: [ipv4('192.168.64.1')] })).toBe('192.168.64.1');
    expect(lanAddress({ lo0: [ipv4('127.0.0.1', true)] })).toBeUndefined();
  });
});

describe('announceCommand', () => {
  it('uses dns-sd on macOS and avahi-publish on Linux', () => {
    expect(announceCommand('darwin', '192.168.1.20')).toEqual([
      '/usr/bin/dns-sd',
      ['-P', 'Orynx', '_https._tcp', 'local', '443', 'orynx.local', '192.168.1.20'],
    ]);
    expect(announceCommand('linux', '192.168.1.20')).toEqual([
      '/usr/bin/avahi-publish',
      ['--address', '--no-reverse', 'orynx.local', '192.168.1.20'],
    ]);
    expect(announceCommand('win32', '192.168.1.20')).toBeUndefined();
  });
});
