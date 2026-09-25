import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  countLibraryTables,
  floorLibraryCount,
  formatLibraryCount,
  parseLibraryStatsResponse,
  statsCacheControl,
  STATS_CACHE_PUBLIC,
  STATS_CACHE_PRIVATE,
  LIBRARY_STAT_LABELS,
  LIBRARY_STAT_TABLES,
  type LibraryCountClient,
} from "./libraryStats.ts";

// Counts measured 2026-09-25 with the anon key (what a guest sees).
const SELF_HOSTED = { laws: 5901, articles: 110794, principles: 18983, decrees: 3318 };
const CLOUD = { laws: 386, articles: 13436, principles: 17940, decrees: 2078 };

test("floors: <10k to the hundred, ≥10k to the thousand, never up", () => {
  assert.equal(floorLibraryCount(5901), 5900);
  assert.equal(floorLibraryCount(110794), 110000);
  assert.equal(floorLibraryCount(18983), 18000);
  assert.equal(floorLibraryCount(3318), 3300);
  assert.equal(floorLibraryCount(386), 300);
  assert.equal(floorLibraryCount(9999), 9900);
  assert.equal(floorLibraryCount(10000), 10000);
  assert.equal(floorLibraryCount(99), 0);
  assert.equal(floorLibraryCount(-5), 0);
  assert.equal(floorLibraryCount(Number.NaN), 0);
});

test("self-hosted figures render as Arabic-numeral floors", () => {
  assert.equal(formatLibraryCount(SELF_HOSTED.laws), "٥٬٩٠٠+");
  assert.equal(formatLibraryCount(SELF_HOSTED.articles), "١١٠٬٠٠٠+");
  assert.equal(formatLibraryCount(SELF_HOSTED.principles), "١٨٬٠٠٠+");
  assert.equal(formatLibraryCount(SELF_HOSTED.decrees), "٣٬٣٠٠+");
});

test("cloud figures render as floors too — the same code is true on either DB", () => {
  assert.equal(formatLibraryCount(CLOUD.laws), "٣٠٠+");
  assert.equal(formatLibraryCount(CLOUD.articles), "١٣٬٠٠٠+");
  assert.equal(formatLibraryCount(CLOUD.principles), "١٧٬٠٠٠+");
  assert.equal(formatLibraryCount(CLOUD.decrees), "٢٬٠٠٠+");
});

test("English formatting and the too-small case", () => {
  assert.equal(formatLibraryCount(5901, "en"), "5,900+");
  assert.equal(formatLibraryCount(50), null);
  assert.equal(formatLibraryCount(0, "en"), null);
});

test("labels say what each table holds (library.laws is every instrument type, not «نظام ولائحة»)", () => {
  assert.equal(LIBRARY_STAT_LABELS.laws.ar, "وثيقة نظامية");
  assert.equal(LIBRARY_STAT_LABELS.articles.ar, "مادة");
  assert.equal(LIBRARY_STAT_LABELS.principles.ar, "مبدأ قضائي");
  assert.equal(LIBRARY_STAT_LABELS.decrees.ar, "قرار وتعميم");
  assert.equal(LIBRARY_STAT_TABLES.laws.column, "slug"); // laws has no `id`
  assert.equal(LIBRARY_STAT_TABLES.decrees.table, "decrees_circulars");
});

test("parseLibraryStatsResponse accepts only a complete numeric payload", () => {
  assert.deepEqual(parseLibraryStatsResponse({ data: SELF_HOSTED }), SELF_HOSTED);
  assert.equal(parseLibraryStatsResponse({ error: "تعذّر" }), null);
  assert.equal(parseLibraryStatsResponse({ data: { ...SELF_HOSTED, articles: "110794" } }), null);
  assert.equal(parseLibraryStatsResponse({ data: { laws: 1, articles: 2, principles: 3 } }), null);
  assert.equal(parseLibraryStatsResponse(null), null);
  assert.equal(parseLibraryStatsResponse("x"), null);
});

type Reply = { count: number | null; error: { message: string } | null };
function fakeClient(replies: Record<string, Reply>, calls: string[] = []): LibraryCountClient {
  return {
    schema: (name) => ({
      from: (table) => ({
        select: (column, options) => {
          calls.push(`${name}.${table}:${column}:${options.count}:${options.head}`);
          return Promise.resolve(replies[table]);
        },
      }),
    }),
  };
}
const ok = (n: number): Reply => ({ count: n, error: null });

test("countLibraryTables reads four narrow exact head counts from the library schema", async () => {
  const calls: string[] = [];
  const stats = await countLibraryTables(
    fakeClient({ laws: ok(5901), articles: ok(110794), principles: ok(18983), decrees_circulars: ok(3318) }, calls),
  );
  assert.deepEqual(stats, SELF_HOSTED);
  assert.deepEqual(calls.sort(), [
    "library.articles:id:exact:true",
    "library.decrees_circulars:id:exact:true",
    "library.laws:slug:exact:true",
    "library.principles:id:exact:true",
  ]);
});

test("countLibraryTables throws on any error or missing count — never a displayed 0", async () => {
  const base = { laws: ok(5901), articles: ok(110794), principles: ok(18983), decrees_circulars: ok(3318) };
  await assert.rejects(
    countLibraryTables(fakeClient({ ...base, principles: { count: null, error: { message: "canceling statement due to statement timeout" } } })),
    /library\.principles count failed/,
  );
  await assert.rejects(countLibraryTables(fakeClient({ ...base, laws: { count: null, error: null } })), /library\.laws count missing/);
});

test("the stats route caches per Supabase host, uses a cookie-less anon client, and never 200s a failure", () => {
  const route = readFileSync(new URL("../../app/api/library/stats/route.ts", import.meta.url), "utf8");
  assert.match(route, /\["library-stats-v1", host\]/);
  assert.match(route, /revalidate: REVALIDATE_SECONDS/);
  assert.match(route, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(route, /SERVICE_ROLE/);
  assert.doesNotMatch(route, /from "@\/lib\/supabase\/server"/);
  assert.match(route, /status: 503, headers: \{ "Cache-Control": "no-store" \}/);
});

// The 200's Cache-Control is decided by statsCacheControl(closed), not
// hardcoded in the route, so a closed-library admin request never ends up
// with a public/s-maxage header that a shared cache could replay to guests.
test("the stats route derives Cache-Control from statsCacheControl(closed), checked after libraryGate", () => {
  const route = readFileSync(new URL("../../app/api/library/stats/route.ts", import.meta.url), "utf8");
  assert.match(route, /const gate = await libraryGate\(\);/);
  assert.match(route, /const \{ closed \} = await getLibraryStatus\(\);/);
  assert.match(route, /"Cache-Control": statsCacheControl\(closed\)/);
  assert.doesNotMatch(route, /"Cache-Control": "public, max-age=3600/);
});

// statsCacheControl is the pure decision the route above just wires in:
// public/shared-cacheable when the library is open, private/no-store when
// the 200 only happened because an admin bypassed a closed library.
test("statsCacheControl: public when open, private no-store when closed (admin-only 200)", () => {
  assert.equal(statsCacheControl(false), STATS_CACHE_PUBLIC);
  assert.equal(statsCacheControl(true), STATS_CACHE_PRIVATE);
  assert.match(STATS_CACHE_PUBLIC, /\bpublic\b/);
  assert.match(STATS_CACHE_PUBLIC, /s-maxage=86400/);
  assert.equal(STATS_CACHE_PRIVATE, "private, no-store");
  assert.doesNotMatch(STATS_CACHE_PRIVATE, /\bpublic\b/);
  assert.doesNotMatch(STATS_CACHE_PRIVATE, /s-maxage/);
});

test("no public component still hardcodes a library figure", () => {
  const files = [
    "../../components/SocialProof.tsx",
    "../../components/CommunityHighlights.tsx",
    "../../components/LegalLibraryBanner.tsx",
    "../../app/about/page.tsx",
    "../../app/ai/page.tsx",
    "../../app/login/page.tsx",
  ];
  const figure = /["'`][^"'`\n]*(٣٨٦|١٣٬٠٠٠|١٧٬٠٠٠|٥٬٩٠٠|١١٠٬٠٠٠|١٨٬٩٠٠|٣٬٣٠٠|\b386\b|13,000\+|17,000\+|5,900\+|110,000\+)/;
  for (const f of files) {
    const code = readFileSync(new URL(f, import.meta.url), "utf8")
      .split(/\r?\n/)
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    assert.doesNotMatch(code, figure, f);
    assert.match(code, /useLibraryStats\(\)/, `${f} reads the live counts`);
  }
});
