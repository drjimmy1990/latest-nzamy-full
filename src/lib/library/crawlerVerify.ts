/**
 * crawlerVerify.ts — how a crawler of the closed list (crawlerList.ts) that
 * may be exempt from the non-subscriber daily view cap is proven
 * (owner register 14 items 53, 56, 60, 64; spec 16.13(5); batch l11, O18 /
 * A16).
 *
 * THE RULE: the User-Agent only says WHICH provider to check. The exemption
 * needs the request's address to prove it: a reverse-DNS name under the
 * provider's own domain that resolves forward to the same address, or an
 * address inside the provider's officially published ranges. A User-Agent
 * alone never exempts anyone (a fake «Googlebot» is an ordinary visitor).
 *
 * The exemption only lifts the non-subscriber COUNT for that provider (up to
 * its own daily number, an admin setting). It never opens a subscriber's
 * text: what a route serves is decided by the viewer's access, as before.
 *
 * The answer agents that fetch a page because a person asked
 * (ChatGPT-User, Claude-User, Perplexity-User — register 60) are ordinary
 * visitors: counted like anyone, and in addition held to one shared daily
 * number per provider. Reading their User-Agent can only make the limit
 * tighter, never looser.
 *
 * This is the ONLY file under src/lib/library and the library routes that
 * reads the User-Agent for a decision (the invariant test in
 * publicGuard.test.ts allow-lists it and checks it is imported only by the
 * cap). Pure: node:net only, and every network lookup is injected
 * (crawlerVerifyServer.ts supplies the real ones), so `node --test` makes no
 * network call.
 */
import { BlockList, isIP } from "node:net";

import { VERIFIED_CRAWLERS, VISITOR_AGENTS, type AgentDef, type CrawlerDef } from "./crawlerList.ts";

export { VERIFIED_CRAWLERS, VISITOR_AGENTS, type AgentDef, type CrawlerDef };

const MAX_UA = 512;

/** What the request's User-Agent claims to be — a claim only, never a proof. */
export interface UaClaim {
  crawler: CrawlerDef | null;
  agent: AgentDef | null;
}

/** Reads the User-Agent header (this file only) and names the claimed crawler / agent. */
export function claimFromHeaders(getHeader: (name: string) => string | null | undefined): UaClaim {
  const raw = getHeader("user-agent");
  return claimFromUserAgent(typeof raw === "string" ? raw : "");
}

export function claimFromUserAgent(ua: string): UaClaim {
  const s = ua.slice(0, MAX_UA);
  if (!s) return { crawler: null, agent: null };
  return {
    agent: VISITOR_AGENTS.find((a) => a.ua.test(s)) ?? null,
    crawler: VERIFIED_CRAWLERS.find((c) => c.ua.test(s)) ?? null,
  };
}

/** A plain IPv4 / IPv6 address (an IPv4-mapped IPv6 address becomes IPv4), or null. */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let ip = raw.trim();
  if (ip.startsWith("[") && ip.includes("]")) ip = ip.slice(1, ip.indexOf("]"));
  const zone = ip.indexOf("%");
  if (zone > 0) ip = ip.slice(0, zone);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) ip = mapped[1];
  return isIP(ip) ? ip.toLowerCase() : null;
}

/** True when `host` is `suffix` or ends in `.suffix` (never «evilgooglebot.com»). */
export function hostnameMatches(host: string, suffixes: readonly string[]): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  if (!h) return false;
  return suffixes.some((s) => {
    const suf = s.toLowerCase().replace(/^\./, "");
    return h === suf || h.endsWith(`.${suf}`);
  });
}

const PREFIX_RE = /"ipv([46])Prefix"\s*:\s*"([0-9a-fA-F:.]+\/\d{1,3})"/g;

/** The prefixes of a published list (Google's format, also used by OpenAI, Perplexity, Anthropic, Bing, Apple, Amazon). */
export function parsePublishedPrefixes(text: string): string[] {
  const out: string[] = [];
  if (typeof text !== "string") return out;
  for (const m of text.matchAll(PREFIX_RE)) {
    out.push(m[2]);
    if (out.length >= 20_000) break;
  }
  return out;
}

/** A matcher over published prefixes (bad entries are skipped). */
export function prefixMatcher(prefixes: readonly string[]): (ip: string) => boolean {
  const list = new BlockList();
  let n = 0;
  for (const p of prefixes) {
    const slash = p.lastIndexOf("/");
    if (slash < 1) continue;
    const net = p.slice(0, slash);
    const bits = Number(p.slice(slash + 1));
    const family = isIP(net);
    if (!family || !Number.isInteger(bits) || bits < 0 || bits > (family === 4 ? 32 : 128)) continue;
    try {
      list.addSubnet(net, bits, family === 4 ? "ipv4" : "ipv6");
      n += 1;
    } catch {
      // a malformed entry is skipped
    }
  }
  return (ip: string) => {
    if (n === 0) return false;
    const norm = normalizeIp(ip);
    if (!norm) return false;
    return list.check(norm, isIP(norm) === 4 ? "ipv4" : "ipv6");
  };
}

export interface VerifyDeps {
  /** PTR names of an address. */
  reverse(ip: string): Promise<string[]>;
  /** A / AAAA addresses of a name (family of the address being checked). */
  resolve(host: string, family: 4 | 6): Promise<string[]>;
  /** A provider's published prefixes, or null when they cannot be read now. */
  ranges(url: string): Promise<string[] | null>;
}

export interface VerifyResult {
  verified: boolean;
  method: "rdns" | "ranges" | null;
}

const MAX_PTR_NAMES = 3;

/**
 * Proves (or not) that `rawIp` belongs to `def`: reverse DNS under the
 * provider's domain, confirmed forward to the same address; else the
 * published ranges. Any lookup error is "not proven". Never throws.
 */
export async function verifyCrawlerIp(def: CrawlerDef, rawIp: string, deps: VerifyDeps): Promise<VerifyResult> {
  const ip = normalizeIp(rawIp);
  if (!ip) return { verified: false, method: null };
  const family = isIP(ip) === 4 ? 4 : 6;
  if (def.rdnsSuffixes.length > 0) {
    try {
      const names = (await deps.reverse(ip)).filter((n) => hostnameMatches(n, def.rdnsSuffixes)).slice(0, MAX_PTR_NAMES);
      for (const name of names) {
        try {
          const forward = (await deps.resolve(name, family)).map((a) => normalizeIp(a));
          if (forward.includes(ip)) return { verified: true, method: "rdns" };
        } catch {
          // try the next name, then the ranges
        }
      }
    } catch {
      // no PTR: fall through to the ranges
    }
  }
  if (def.rangesUrl) {
    try {
      const prefixes = await deps.ranges(def.rangesUrl);
      if (prefixes && prefixMatcher(prefixes)(ip)) return { verified: true, method: "ranges" };
    } catch {
      // not proven
    }
  }
  return { verified: false, method: null };
}
