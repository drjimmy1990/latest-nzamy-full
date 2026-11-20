/**
 * crawlerVerify.test.ts — batch l11 (O18 / A16): a crawler is exempt only
 * when its ADDRESS proves it; the User-Agent only picks the provider.
 * No network: every lookup is injected.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/crawlerVerify.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  VERIFIED_CRAWLERS,
  VISITOR_AGENTS,
  claimFromHeaders,
  claimFromUserAgent,
  hostnameMatches,
  normalizeIp,
  parsePublishedPrefixes,
  prefixMatcher,
  verifyCrawlerIp,
  type VerifyDeps,
} from "./crawlerVerify.ts";

const crawler = (id: string) => VERIFIED_CRAWLERS.find((c) => c.id === id)!;

const GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

test("the closed list is the owner's (register 60 + Amazonbot on probation, register 64)", () => {
  assert.deepEqual(VERIFIED_CRAWLERS.map((c) => c.id), [
    "googlebot", "bingbot", "applebot", "oai-searchbot", "claude-searchbot", "perplexitybot", "amazonbot",
  ]);
  assert.deepEqual(VISITOR_AGENTS.map((a) => a.id), ["chatgpt-user", "claude-user", "perplexity-user"]);
  assert.equal(crawler("amazonbot").probation, true);
  for (const c of VERIFIED_CRAWLERS) {
    assert.ok(c.rdnsSuffixes.length > 0 || c.rangesUrl, `${c.id} has a proof method`);
    if (c.rangesUrl) assert.match(c.rangesUrl, /^https:\/\//, `${c.id} ranges over https`);
  }
  // training / bulk crawlers are never on the exempt list
  for (const ua of ["GPTBot/1.1", "ClaudeBot/1.0", "CCBot/2.0", "Bytespider"]) {
    assert.equal(claimFromUserAgent(ua).crawler, null, ua);
  }
});

test("the User-Agent names a claim only", () => {
  assert.equal(claimFromUserAgent(GOOGLEBOT_UA).crawler?.id, "googlebot");
  assert.equal(claimFromUserAgent("Mozilla/5.0 AppleWebKit (KHTML, like Gecko; compatible; bingbot/2.0)").crawler?.id, "bingbot");
  assert.equal(claimFromUserAgent("Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)").agent?.id, "chatgpt-user");
  assert.equal(claimFromUserAgent("Mozilla/5.0 Claude-User/1.0").agent?.id, "claude-user");
  assert.equal(claimFromUserAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/130").crawler, null);
  assert.equal(claimFromUserAgent("").crawler, null);
  assert.equal(claimFromHeaders((n) => (n === "user-agent" ? GOOGLEBOT_UA : null)).crawler?.id, "googlebot");
  assert.equal(claimFromHeaders(() => null).crawler, null);
});

test("addresses: IPv4-mapped IPv6 becomes IPv4; junk is refused", () => {
  assert.equal(normalizeIp("::ffff:66.249.66.1"), "66.249.66.1");
  assert.equal(normalizeIp("[2001:4860:4801:10::1]"), "2001:4860:4801:10::1");
  assert.equal(normalizeIp(" 66.249.66.1 "), "66.249.66.1");
  assert.equal(normalizeIp("unknown"), null);
  assert.equal(normalizeIp("66.249.66.1, 1.2.3.4"), null);
});

test("reverse-DNS names match on a dot boundary only", () => {
  assert.equal(hostnameMatches("crawl-66-249-66-1.googlebot.com.", ["googlebot.com"]), true);
  assert.equal(hostnameMatches("googlebot.com", ["googlebot.com"]), true);
  assert.equal(hostnameMatches("evilgooglebot.com", ["googlebot.com"]), false);
  assert.equal(hostnameMatches("crawl.googlebot.com.attacker.net", ["googlebot.com"]), false);
  assert.equal(hostnameMatches("msnbot-1-2-3-4.search.msn.com", ["search.msn.com"]), true);
});

test("published lists: Google's JSON format and an HTML page that embeds it", () => {
  const json = JSON.stringify({ creationTime: "x", prefixes: [{ ipv4Prefix: "66.249.64.0/27" }, { ipv6Prefix: "2001:4860:4801:10::/64" }] });
  assert.deepEqual(parsePublishedPrefixes(json), ["66.249.64.0/27", "2001:4860:4801:10::/64"]);
  const html = `<html><pre>{"prefixes": [ { "ipv4Prefix": "52.70.240.0/24" } ]}</pre></html>`;
  assert.deepEqual(parsePublishedPrefixes(html), ["52.70.240.0/24"]);
  const has = prefixMatcher(["66.249.64.0/27", "2001:4860:4801:10::/64", "bad", "1.2.3.4/99"]);
  assert.equal(has("66.249.64.5"), true);
  assert.equal(has("::ffff:66.249.64.5"), true);
  assert.equal(has("66.249.64.40"), false);
  assert.equal(has("2001:4860:4801:10::abcd"), true);
  assert.equal(has("2001:4860:4801:11::1"), false);
  assert.equal(prefixMatcher([])("66.249.64.5"), false);
});

function deps(over: Partial<VerifyDeps> = {}): VerifyDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    reverse: async (ip) => {
      calls.push(`ptr ${ip}`);
      return over.reverse ? over.reverse(ip) : [];
    },
    resolve: async (host, family) => {
      calls.push(`fwd ${host} ${family}`);
      return over.resolve ? over.resolve(host, family) : [];
    },
    ranges: async (url) => {
      calls.push(`ranges ${url}`);
      return over.ranges ? over.ranges(url) : null;
    },
  };
}

test("reverse DNS + forward confirm proves Googlebot", async () => {
  const d = deps({
    reverse: async () => ["crawl-66-249-66-1.googlebot.com"],
    resolve: async () => ["66.249.66.1"],
  });
  assert.deepEqual(await verifyCrawlerIp(crawler("googlebot"), "66.249.66.1", d), { verified: true, method: "rdns" });
});

test("a PTR under the right domain that does not resolve back is NOT a proof (forged PTR)", async () => {
  const d = deps({
    reverse: async () => ["crawl-1-2-3-4.googlebot.com"],
    resolve: async () => ["66.249.66.99"],
  });
  assert.deepEqual(await verifyCrawlerIp(crawler("googlebot"), "1.2.3.4", d), { verified: false, method: null });
});

test("a PTR under another domain is never resolved forward", async () => {
  const d = deps({ reverse: async () => ["host.attacker.example"], resolve: async () => ["1.2.3.4"] });
  assert.equal((await verifyCrawlerIp(crawler("googlebot"), "1.2.3.4", d)).verified, false);
  assert.ok(!d.calls.some((c) => c.startsWith("fwd")), "no forward lookup of a foreign name");
});

test("the published ranges prove a ranges-only crawler; a DNS failure falls through to them", async () => {
  const oai = deps({ ranges: async () => ["20.42.10.0/24"] });
  assert.deepEqual(await verifyCrawlerIp(crawler("oai-searchbot"), "20.42.10.7", oai), { verified: true, method: "ranges" });
  assert.ok(!oai.calls.some((c) => c.startsWith("ptr")), "no reverse lookup for a ranges-only provider");
  const g = deps({
    reverse: async () => {
      throw new Error("ENOTFOUND");
    },
    ranges: async () => ["66.249.64.0/27"],
  });
  assert.deepEqual(await verifyCrawlerIp(crawler("googlebot"), "66.249.64.5", g), { verified: true, method: "ranges" });
});

test("unreadable ranges, a bad address or an address outside the ranges: not proven", async () => {
  assert.equal((await verifyCrawlerIp(crawler("perplexitybot"), "1.2.3.4", deps())).verified, false);
  assert.equal((await verifyCrawlerIp(crawler("perplexitybot"), "1.2.3.4", deps({ ranges: async () => ["5.6.7.0/24"] }))).verified, false);
  assert.equal((await verifyCrawlerIp(crawler("perplexitybot"), "unknown", deps({ ranges: async () => ["0.0.0.0/0"] }))).verified, false);
  const throwing = deps({ ranges: async () => { throw new Error("timeout"); } });
  assert.equal((await verifyCrawlerIp(crawler("claude-searchbot"), "1.2.3.4", throwing)).verified, false);
});
