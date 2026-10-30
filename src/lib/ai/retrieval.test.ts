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

/**
 * The service client with every chain retrieval builds (owner's live test,
 * 29 Oct): laws by name (ilike), articles by law and number, articles inside
 * one law (textSearch), the open article, the relevance functions and titles.
 */
type Op = [string, ...unknown[]];
function chainAdmin(lib: {
  laws: Array<{ slug: string; title: string; status?: string }>;
  articles: Array<Record<string, unknown> & { id: string; law_slug: string; number: number; words?: string }>;
  ranked?: Array<Record<string, unknown>>;
}) {
  const log: Array<{ table: string; ops: Op[] }> = [];
  const likeToRegex = (p: string) =>
    new RegExp(`^${p.replace(/\\([\\%_])/g, "\u0001$1").replace(/[.*+?^${}()|[\]]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".").replace(/\u0001(.)/g, (_m, c) => `\\${c}`)}$`, "s");
  const resolve = (table: string, ops: Op[]) => {
    let rows: Array<Record<string, unknown>> = table === "laws" ? lib.laws : lib.articles;
    for (const [op, col, val] of ops) {
      if (op === "eq") rows = rows.filter((r) => r[col as string] === val);
      if (op === "in") rows = rows.filter((r) => (val as unknown[]).includes(r[col as string]));
      if (op === "ilike") rows = rows.filter((r) => likeToRegex(val as string).test(String(r[col as string])));
      // A search inside one law: every word of the tsquery in the article's words.
      if (op === "textSearch") {
        const groups = String(val).split("&").map((g) => [...g.matchAll(/'([^']+)'/g)].map((m) => m[1]));
        rows = rows.filter((r) => groups.every((alts) => alts.some((w) => String(r.words ?? "").split(" ").includes(w))));
      }
    }
    return { data: rows, error: null };
  };
  const chain = (table: string) => {
    const ops: Op[] = [];
    log.push({ table, ops });
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "ilike", "textSearch", "order", "abortSignal"]) {
      c[m] = (...a: unknown[]) => (ops.push([m, ...a]), c);
    }
    c.limit = (n: number) => {
      const r = resolve(table, ops);
      return Promise.resolve({ ...r, data: r.data.slice(0, n) });
    };
    c.in = (...a: unknown[]) => (ops.push(["in", ...a]), Promise.resolve(resolve(table, ops)));
    c.maybeSingle = () => Promise.resolve({ data: resolve(table, ops).data[0] ?? null, error: null });
    return c;
  };
  const admin = {
    schema: () => ({
      from: chain,
      rpc: (fn: string) => ({
        abortSignal: () =>
          Promise.resolve({ data: { ranked: true, rows: fn === "search_law_articles_relevance" ? (lib.ranked ?? []) : [] }, error: null }),
      }),
    }),
  };
  return { admin, log };
}

const LIB = {
  laws: [
    { slug: "labor-law", title: "نظام العمل", status: "active" },
    { slug: "labor-rules", title: "اللائحة التنفيذية لنظام العمل", status: "active" },
    { slug: "social-security-law", title: "نظام الضمان الاجتماعي", status: "active" },
    { slug: "civil-transactions-law", title: "نظام المعاملات المدنية", status: "active" },
  ],
  articles: [
    { id: "labor-law__art-1", law_slug: "labor-law", number: 1, status: "active", text: "يسمى هذا النظام نظام العمل" },
    { id: "labor-rules__art-1", law_slug: "labor-rules", number: 1, status: "active", text: "أولى اللائحة" },
    { id: "social-security-law__art-1-old", law_slug: "social-security-law", number: 1, status: "repealed", text: "القديمة" },
    { id: "social-security-law__art-1", law_slug: "social-security-law", number: 1, status: "active", text: "يقصد بالمستفيد", words: "المستفيد الاسرة" },
    { id: "civil-transactions-law__art-307", law_slug: "civil-transactions-law", number: 307, status: "active", text: "البيع عقد يلتزم", words: "عقد البيع" },
  ],
  // What the whole library ranks first for the same words: another law.
  ranked: [{ id: "labor-law__art-50", law_slug: "labor-law", number: 50, text: "عقد العمل" }],
};

test("«ما هي المادة الأولى من نظام العمل» reads that article first, from that law, not its executive regulation", async () => {
  const { admin } = chainAdmin(LIB);
  const out = await retrieveLibrary(admin as never, ["نظام العمل"], { laws: 6, principles: 3 }, { question: "ما هي المادة الأولى من نظام العمل؟" });
  assert.equal(out.map.S1.id, "labor-law__art-1");
  assert.ok(!Object.values(out.map).some((s) => s.id === "labor-rules__art-1"));
});

test("an article named by number reads the version in force, and stands even with no searches", async () => {
  const { admin } = chainAdmin(LIB);
  const out = await retrieveLibrary(admin as never, [], { laws: 6, principles: 3 }, { question: "اشرح المادة 1 من نظام الضمان الاجتماعي" });
  assert.deepEqual(Object.values(out.map).map((s) => s.id), ["social-security-law__art-1"]);
});

test("on a law page the page's law is searched first, and «المادة الأولى» alone means its article", async () => {
  const { admin, log } = chainAdmin(LIB);
  const out = await retrieveLibrary(admin as never, ["المستفيد"], { laws: 6, principles: 3 }, { lawSlug: "social-security-law", question: "من هو المستفيد؟" });
  assert.equal(out.map.S1.id, "social-security-law__art-1", "the page's own hit before the library's");
  assert.ok(log.some((l) => l.ops.some(([op, col, val]) => op === "eq" && col === "law_slug" && val === "social-security-law")));
  assert.ok(!log.some((l) => l.table === "laws" && l.ops.some(([op]) => op === "ilike")), "the page names the law; no lookup by name");

  const first = await retrieveLibrary(admin as never, [], { laws: 6, principles: 3 }, { lawSlug: "labor-law", question: "ما هي المادة الأولى؟" });
  assert.deepEqual(Object.values(first.map).map((s) => s.id), ["labor-law__art-1"]);
});

test("a law named in the question scopes the search; the library's hits follow", async () => {
  const { admin } = chainAdmin(LIB);
  const out = await retrieveLibrary(admin as never, ["عقد البيع"], { laws: 6, principles: 3 }, { question: "تعريف عقد البيع في نظام المعاملات المدنية" });
  assert.deepEqual(Object.values(out.map).map((s) => s.id), ["civil-transactions-law__art-307", "labor-law__art-50"]);
});

test("a law the library does not have pins nothing, and the plain search still answers", async () => {
  const { admin } = chainAdmin(LIB);
  const out = await retrieveLibrary(admin as never, ["عقد"], { laws: 6, principles: 3 }, { question: "المادة 3 من نظام الطيران المدني" });
  assert.deepEqual(Object.values(out.map).map((s) => s.id), ["labor-law__art-50"]);
});

test("cleanQueries drops the framing the answering text never says («تعريف عقد البيع» → «عقد البيع»)", () => {
  assert.deepEqual(cleanQueries(["تعريف عقد البيع", "ما هو التعريف", "المادة الأولى نظام العمل"]), ["عقد البيع", "نظام العمل"]);
});
