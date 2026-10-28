/**
 * retrieval.test.ts — the library texts a wave-2 tool answers from: the
 * model's searches cleaned, the hits interleaved by rank, the S-ids and the
 * source map, and the relevance functions' unranked windows dropped.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/retrieval.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildSources, cleanQueries, interleave, retrieveLibrary, SOURCE_TEXT_MAX } from "./retrieval.ts";

test("cleanQueries keeps 1–4 distinct short searches and strips the search operators", () => {
  assert.deepEqual(cleanQueries(["مكافأة نهاية الخدمة", "  استقالة   العامل ", "مكافأة نهاية الخدمة"]), [
    "مكافأة نهاية الخدمة",
    "استقالة العامل",
  ]);
  assert.deepEqual(cleanQueries(['"فسخ" / عقد (الإيجار)']), ["فسخ عقد الإيجار"]);
  assert.equal(cleanQueries(["أ", "ب".repeat(81), 7, null, "", "x y", "a b", "c d", "e f", "g h"]).length, 4);
  assert.deepEqual(cleanQueries("not an array"), []);
});

test("interleave takes every search's first hit before any second hit, without repeats", () => {
  const a = [{ id: "a1" }, { id: "a2" }, { id: "a3" }];
  const b = [{ id: "b1" }, { id: "a1" }, { id: "b2" }];
  assert.deepEqual(interleave([a, b], 4).map((r) => r.id), ["a1", "b1", "a2", "a3"]);
  assert.deepEqual(interleave([], 5), []);
});

test("buildSources numbers articles then principles, titles them, links them and marks a repealed text", () => {
  const long = "ن".repeat(SOURCE_TEXT_MAX + 50);
  const out = buildSources(
    [
      { id: "labor-law__art-80", law_slug: "labor-law", number: 80, number_text: "الثمانون", text: "لا يجوز لصاحب العمل فسخ العقد…", status: "active" },
      { id: "old__art-1", law_slug: "old law", number: 1, number_text: null, text: "", original_text: long, status: "repealed" },
      { id: "empty__art-2", law_slug: "labor-law", number: 2, text: "  " },
    ],
    [{ id: "LAW-98-1253__pr-35", principle_number: 35, issuing_body: "الهيئة العليا لتسوية الخلافات العمالية", text: "مبدأ", year_hijri: 1415, judicial_collections: { id: "LAW-98-1253" } }],
    new Map([["labor-law", "نظام العمل"], ["old law", "نظام ملغى"]]),
  );
  assert.deepEqual(out.sources.map((s) => s.sid), ["S1", "S2", "S3"], "the empty article is skipped");
  assert.equal(out.sources[0].title, "نظام العمل — الثمانون");
  assert.match(out.sources[1].title, /\(مادة ملغاة\)$/, "the model is told the text is repealed");
  assert.doesNotMatch(out.map.S2.title, /ملغاة/, "the chip shows the plain title");
  assert.equal(out.sources[1].text.length, SOURCE_TEXT_MAX + 1, "clipped, with an ellipsis");
  assert.equal(out.map.S1.url, "/laws/labor-law#labor-law__art-80");
  assert.equal(out.map.S2.url, "/laws/old%20law#old__art-1");
  assert.deepEqual(out.map.S3, {
    kind: "principle",
    id: "LAW-98-1253__pr-35",
    title: "مبدأ رقم 35 — الهيئة العليا لتسوية الخلافات العمالية — 1415هـ",
    url: "/precedents/LAW-98-1253#LAW-98-1253__pr-35",
  });
});

/** The service client's library schema: the two relevance functions and the laws table. */
function fakeAdmin(pages: Record<string, unknown>) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const admin = {
    schema(name: string) {
      assert.equal(name, "library");
      return {
        rpc(fn: string, args: Record<string, unknown>) {
          calls.push({ fn, args });
          const res = pages[fn] instanceof Error ? { data: null, error: { code: "57014", message: "canceled" } } : { data: pages[fn], error: null };
          return { abortSignal: () => Promise.resolve(res) };
        },
        from(table: string) {
          if (table === "articles") {
            // The open article, read by id (L5 «اشرح لي»).
            return {
              select: () => ({
                eq: (_c: string, id: string) => ({
                  abortSignal: () => ({
                    maybeSingle: () => Promise.resolve({ data: pages.pinned && (pages.pinned as { id: string }).id === id ? pages.pinned : null, error: null }),
                  }),
                }),
              }),
            };
          }
          assert.equal(table, "laws");
          return { select: () => ({ in: (_c: string, slugs: string[]) => Promise.resolve({ data: slugs.map((s) => ({ slug: s, title: `نظام ${s}` })), error: null }) }) };
        },
      };
    },
  };
  return { admin, calls };
}

test("retrieveLibrary runs every search on both sections and drops an unranked window", async () => {
  const { admin, calls } = fakeAdmin({
    search_law_articles_relevance: { ranked: true, count: 2, rows: [{ id: "x__art-1", law_slug: "x", number: 1, text: "نص" }] },
    // Over 5,000 matches: ordered by id, so not answers.
    search_principles_relevance: { ranked: false, count: 9000, rows: [{ id: "p1", text: "مبدأ" }] },
  });
  const out = await retrieveLibrary(admin as never, ["مكافأة نهاية الخدمة", "استقالة"], { laws: 8, principles: 4 });
  assert.equal(calls.length, 4, "two searches × two sections");
  assert.ok(calls.every((c) => typeof c.args.p_tsquery === "string" && c.args.p_offset === 0));
  assert.deepEqual(out.sources.map((s) => s.kind), ["article"]);
  assert.equal(out.sources[0].title, "نظام x — المادة 1");
});

test("an open article is S1 and marked, the searches fill the rest without repeating it", async () => {
  const { admin } = fakeAdmin({
    pinned: { id: "x__art-9", law_slug: "x", number: 9, text: "المادة المفتوحة" },
    search_law_articles_relevance: { ranked: true, rows: [{ id: "x__art-9", law_slug: "x", number: 9, text: "المادة المفتوحة" }, { id: "y__art-1", law_slug: "y", number: 1, text: "أخرى" }] },
    search_principles_relevance: { ranked: true, rows: [] },
  });
  const out = await retrieveLibrary(admin as never, ["شرح"], { laws: 6, principles: 3 }, { articleId: "x__art-9" });
  assert.deepEqual(out.sources.map((s) => [s.sid, s.pinned ?? false]), [["S1", true], ["S2", false]]);
  assert.equal(out.map.S1.id, "x__art-9");

  // With no searches at all, the open article alone is still something to answer from.
  const alone = await retrieveLibrary(admin as never, [], { laws: 6, principles: 3 }, { articleId: "x__art-9" });
  assert.equal(alone.sources.length, 1);
  // An id that does not exist pins nothing.
  const missing = await retrieveLibrary(admin as never, [], { laws: 6, principles: 3 }, { articleId: "nope" });
  assert.equal(missing.sources.length, 0);
});

test("a failed search costs only its own hits; nothing found is an empty result", async () => {
  const { admin } = fakeAdmin({ search_law_articles_relevance: new Error("timeout"), search_principles_relevance: { ranked: true, rows: [] } });
  const out = await retrieveLibrary(admin as never, ["غياب العامل"], { laws: 8, principles: 4 });
  assert.deepEqual(out, { sources: [], map: {} });
});
