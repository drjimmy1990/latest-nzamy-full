/**
 * crawlerVerifyServer.ts — the network half of crawlerVerify.ts (batch l11,
 * O18 / A16): DNS through a resolver with a short timeout, the providers'
 * published address lists fetched at most once a day, and every answer
 * remembered per (provider, address).
 *
 * Called ONLY by publicViewCapServer.ts, and only when the non-subscriber cap
 * is switched ON and the User-Agent names a crawler of the closed list whose
 * own switch is on — while the cap is off this file does nothing at all.
 *
 * A flood of fake «Googlebot» requests cannot turn the site into a DNS
 * amplifier: answers are remembered (proven 24 h, not proven 1 h), at most
 * MAX_INFLIGHT lookups run at once (beyond that: "not proven", not
 * remembered), and each lookup has a 1.5 s budget. Not proven = an ordinary
 * visitor, which is the safe side for the library.
 */
import { Resolver } from "node:dns/promises";
import { TtlMemo } from "./readQuota";
import { parsePublishedPrefixes, verifyCrawlerIp, type CrawlerDef, type VerifyDeps, type VerifyResult } from "./crawlerVerify";

const DNS_TIMEOUT_MS = 1_500;
const RANGES_TIMEOUT_MS = 3_000;
const RANGES_MAX_BYTES = 2 * 1024 * 1024;
const PROVEN_TTL_MS = 24 * 60 * 60 * 1000;
const NOT_PROVEN_TTL_MS = 60 * 60 * 1000;
const RANGES_TTL_MS = 24 * 60 * 60 * 1000;
const RANGES_FAIL_TTL_MS = 60 * 60 * 1000;
const MAX_INFLIGHT = 8;

const results = new TtlMemo<VerifyResult>(PROVEN_TTL_MS, 20_000);
const rangesCache = new Map<string, { prefixes: string[] | null; expiresAt: number }>();
const rangesInflight = new Map<string, Promise<string[] | null>>();
let inflight = 0;

const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 1 });

async function fetchRanges(url: string): Promise<string[] | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json, text/html;q=0.5" },
      signal: AbortSignal.timeout(RANGES_TIMEOUT_MS),
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > RANGES_MAX_BYTES) return null;
    const prefixes = parsePublishedPrefixes(text);
    return prefixes.length > 0 ? prefixes : null;
  } catch {
    return null;
  }
}

async function cachedRanges(url: string): Promise<string[] | null> {
  const hit = rangesCache.get(url);
  if (hit && hit.expiresAt > Date.now()) return hit.prefixes;
  const running = rangesInflight.get(url);
  if (running) return running;
  const p = fetchRanges(url)
    .then((prefixes) => {
      rangesCache.set(url, { prefixes, expiresAt: Date.now() + (prefixes ? RANGES_TTL_MS : RANGES_FAIL_TTL_MS) });
      return prefixes;
    })
    .finally(() => rangesInflight.delete(url));
  rangesInflight.set(url, p);
  return p;
}

const DEPS: VerifyDeps = {
  reverse: (ip) => resolver.reverse(ip),
  resolve: (host, family) => (family === 4 ? resolver.resolve4(host) : resolver.resolve6(host)),
  ranges: cachedRanges,
};

/** Is this address really `def`? Remembered; never throws; "no" when busy. */
export async function isVerifiedCrawler(def: CrawlerDef, ip: string): Promise<boolean> {
  const key = `${def.id}|${ip}`;
  const hit = results.get(key);
  if (hit) return hit.verified;
  if (inflight >= MAX_INFLIGHT) return false;
  inflight += 1;
  try {
    const result = await verifyCrawlerIp(def, ip, DEPS);
    results.set(key, result, result.verified ? PROVEN_TTL_MS : NOT_PROVEN_TTL_MS);
    return result.verified;
  } catch {
    return false;
  } finally {
    inflight -= 1;
  }
}
