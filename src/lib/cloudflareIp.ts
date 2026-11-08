/**
 * Is this address one of Cloudflare's edge servers?
 *
 * Used by libraryReadClientKey (src/lib/rateLimitRoutes.ts): the visitor's
 * address in `CF-Connecting-IP` is used only when the request's peer
 * (X-Real-IP, set by nginx from the TCP connection) is a Cloudflare edge —
 * i.e. the request really came through Cloudflare, which sets that header —
 * or a local hop (isPrivateOrLoopbackIp below).
 *
 * Ranges: https://www.cloudflare.com/ips-v4 and /ips-v6, copied 2026-11-08.
 * Cloudflare changes them rarely; a missing new range only means its visitors
 * are counted by the edge address until the list is updated.
 *
 * Pure: `node --test` loads it directly.
 */

export const CLOUDFLARE_IPV4_RANGES: readonly string[] = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
];

export const CLOUDFLARE_IPV6_RANGES: readonly string[] = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

/** IPv4 dotted quad → 32-bit number, or null. */
export function parseIpv4(text: string): number | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

/** IPv6 text → 128-bit bigint, or null. Accepts `::`, a trailing dotted quad and a `%zone`. */
export function parseIpv6(text: string): bigint | null {
  let s = text.split("%")[0];
  if (s === "" || !/^[0-9A-Fa-f:.]+$/.test(s)) return null;
  // A trailing IPv4 part becomes two groups.
  const lastColon = s.lastIndexOf(":");
  if (s.includes(".")) {
    const v4 = parseIpv4(s.slice(lastColon + 1));
    if (v4 === null) return null;
    s = `${s.slice(0, lastColon + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] === "" ? [] : halves[0].split(":");
  const tail = halves.length === 2 ? (halves[1] === "" ? [] : halves[1].split(":")) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  let value = BigInt(0);
  for (const g of groups) {
    if (!/^[0-9A-Fa-f]{1,4}$/.test(g)) return null;
    value = (value << BigInt(16)) | BigInt(Number.parseInt(g, 16));
  }
  return value;
}

type V4Range = { base: number; bits: number };
type V6Range = { base: bigint; bits: number };

const V4: readonly V4Range[] = CLOUDFLARE_IPV4_RANGES.map((cidr) => {
  const [addr, bits] = cidr.split("/");
  return { base: parseIpv4(addr)!, bits: Number(bits) };
});
const V6: readonly V6Range[] = CLOUDFLARE_IPV6_RANGES.map((cidr) => {
  const [addr, bits] = cidr.split("/");
  return { base: parseIpv6(addr)!, bits: Number(bits) };
});

function inV4(ip: number): boolean {
  return V4.some(({ base, bits }) => Math.floor(ip / 2 ** (32 - bits)) === Math.floor(base / 2 ** (32 - bits)));
}

function inV6(ip: bigint): boolean {
  return V6.some(({ base, bits }) => ip >> BigInt(128 - bits) === base >> BigInt(128 - bits));
}

const V4_MAPPED_PREFIX = BigInt(0xffff) << BigInt(32);

/** IPv4 loopback / RFC 1918 / link-local / CGNAT ranges. */
const PRIVATE_V4: readonly V4Range[] = ["127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16", "100.64.0.0/10"].map((cidr) => {
  const [addr, bits] = cidr.split("/");
  return { base: parseIpv4(addr)!, bits: Number(bits) };
});

function inRanges(ip: number, ranges: readonly V4Range[]): boolean {
  return ranges.some(({ base, bits }) => Math.floor(ip / 2 ** (32 - bits)) === Math.floor(base / 2 ** (32 - bits)));
}

/**
 * True for a loopback or private-network address (IPv4 private ranges, `::1`,
 * fc00::/7, fe80::/10, and their IPv4-mapped forms). Such a peer is a hop on
 * the server itself (a tunnel daemon, a container network), not a visitor.
 */
export function isPrivateOrLoopbackIp(ip: string | null | undefined): boolean {
  const text = (ip ?? "").trim();
  if (text === "") return false;
  const v4 = parseIpv4(text);
  if (v4 !== null) return inRanges(v4, PRIVATE_V4);
  const v6 = parseIpv6(text);
  if (v6 === null) return false;
  if (v6 >> BigInt(32) === V4_MAPPED_PREFIX >> BigInt(32)) return inRanges(Number(v6 & BigInt(0xffffffff)), PRIVATE_V4);
  if (v6 === BigInt(1)) return true;
  const top = Number(v6 >> BigInt(112));
  return (top & 0xfe00) === 0xfc00 || (top & 0xffc0) === 0xfe80;
}

/** True when `ip` (IPv4, IPv6, or IPv4-mapped IPv6) is inside a Cloudflare range. */
export function isCloudflareIp(ip: string | null | undefined): boolean {
  const text = (ip ?? "").trim();
  if (text === "") return false;
  const v4 = parseIpv4(text);
  if (v4 !== null) return inV4(v4);
  const v6 = parseIpv6(text);
  if (v6 === null) return false;
  if (v6 >> BigInt(32) === V4_MAPPED_PREFIX >> BigInt(32)) return inV4(Number(v6 & BigInt(0xffffffff)));
  return inV6(v6);
}
