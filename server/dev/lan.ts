import { networkInterfaces } from 'node:os';
import type { H3Event } from 'h3';

/** RFC 1918 private ranges — what a phone on the same Wi-Fi actually sees. */
function isPrivate(address: string): boolean {
  return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
}

/**
 * Every non-internal IPv4 address this machine has, most likely first (a
 * private LAN address before anything else — a phone on the same Wi-Fi
 * reaches those, not a Docker bridge or a VPN tunnel).
 */
export function lanAddresses(): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue;
      if (entry.family !== 'IPv4' && String(entry.family) !== '4') continue;
      addresses.push(entry.address);
    }
  }
  return addresses.sort((a, b) => Number(isPrivate(b)) - Number(isPrivate(a)));
}

/** The port this request actually reached the dev server on. */
export function devServerPort(event: H3Event): number {
  return event.node.req.socket.localPort ?? 3000;
}

/** The APK download URL on every LAN address this machine has, most likely first. */
export function apkUrls(event: H3Event): string[] {
  const port = devServerPort(event);
  return lanAddresses().map((address) => `http://${address}:${port}/dev/apk`);
}
