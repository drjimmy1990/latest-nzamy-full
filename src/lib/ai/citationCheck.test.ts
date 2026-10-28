/**
 * citationCheck.test.ts — L8: the library, not the model, decides each cited
 * article's status. Spelling-tolerant law names, the year suffix ignored, the
 * best edition that has the article, in force / amended / repealed / missing,
 * and a failed read marks citations unchecked instead of failing the run.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/citationCheck.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { checkCitations, cleanCited, coreTitle, enrichBriefCheck, lawNamePattern, rankLaws } from "./citationCheck.ts";

test("coreTitle drops diacritics, a year suffix and «الصادر…», but not a word that only contains «عام»", () => {
  assert.equal(coreTitle("نظامُ العمل لعام 1426هـ"), "نظام العمل");
  assert.equal(coreTitle("نظام الإثبات الصادر بالمرسوم الملكي رقم م/43"), "نظام الاثبات");
  assert.equal(coreTitle("نظام الأحكام العامة"), "نظام الاحكام العامه");
});

test("lawNamePattern lets alef, hamza, taa marbuta and alif maqsura match each other; a typed wildcard never reaches it", () => {
  // A space is `%` too, so «نظام العمل» also finds «نظام العمل لعام 1426هـ».
  assert.equal(lawNamePattern("نظام الاثبات"), "%نظ_م%_ل_ثب_ت%");
  // coreTitle keeps letters and spaces only: `%` and `_` from the memo are gone.
  assert.equal(lawNamePattern("نظام 100%_x"), "%نظ_م%x%");
});

test("rankLaws: the exact name first, then a title starting with it, the law in force before a repealed one", () => {
  const laws = [
    { slug: "regs", title: "اللائحة التنفيذية لنظام العمل", status: "active" },
    { slug: "old", title: "نظام العمل", status: "repealed" },
    { slug: "cur", title: "نظام العمل لعام 1426هـ", status: "active" },
    { slug: "x", title: "نظام العمل التطوعي", status: "active" },
  ];
  assert.deepEqual(rankLaws("نظام العمل", laws).map((l) => l.slug), ["cur", "old", "x", "regs"]);
});

test("cleanCited keeps a law name and a whole article number once each, Arabic digits included", () => {
  const out = cleanCited([
    { law: "نظام العمل", article: 77, as_written: "المادة (77)" },
    { law: "نظام العمل", article: "٧٧" },
    { law: "نظام العمل", article: "٨٠" },
    { law: "", article: 5 },
    { law: "نظام", article: 0 },
    "junk",
  ]);
  assert.deepEqual(out.map((c) => [c.law, c.article]), [["نظام العمل", 77], ["نظام العمل", 80]]);
  assert.equal(out[1].as_written, "المادة 80 من نظام العمل");
});

/** The service client's library schema: laws by ILIKE, articles by law and number. */
function fakeAdmin(laws: Array<{ slug: string; title: string; status: string }>, articles: Array<{ id: string; number: number; status: string; law_slug: string }>, fail?: "laws" | "articles") {
  const likeToRegex = (p: string) => new RegExp(`^${p.replace(/\\([%_\\])/g, "\u0000$1").replace(/[.*+?^${}()|[\]]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".").replace(/\u0000(.)/g, "\\$1")}$`, "u");
  return {
    schema: (name: string) => {
      assert.equal(name, "library");
      return {
        from: (table: string) => {
          if (table === "laws") {
            return {
              select: () => ({
                ilike: (_c: string, pattern: string) => ({
                  limit: async () =>
                    fail === "laws" ? { data: null, error: { code: "57014", message: "timeout" } } : { data: laws.filter((l) => likeToRegex(pattern).test(l.title)), error: null },
                }),
              }),
            };
          }
          assert.equal(table, "articles");
          return {
            select: () => ({
              in: (_c: string, slugs: string[]) => ({
                in: async (_c2: string, nums: number[]) =>
                  fail === "articles"
                    ? { data: null, error: { code: "57014", message: "timeout" } }
                    : { data: articles.filter((a) => slugs.includes(a.law_slug) && nums.includes(a.number)), error: null },
              }),
            }),
          };
        },
      };
    },
  };
}

const LAWS = [
  { slug: "labor", title: "نظام العمل لعام 1426هـ", status: "active" },
  { slug: "evidence", title: "نظام الإثبات", status: "active" },
];
const ARTICLES = [
  { id: "labor__art-77", number: 77, status: "active", law_slug: "labor" },
  { id: "labor__art-39", number: 39, status: "repealed", law_slug: "labor" },
  { id: "labor__art-39-amended", number: 39, status: "amended", law_slug: "labor" },
  { id: "evidence__art-5", number: 5, status: "repealed", law_slug: "evidence" },
];

test("each citation gets the library's verdict, a link, and why when not found", async () => {
  const out = await checkCitations(fakeAdmin(LAWS, ARTICLES) as never, cleanCited([
    { law: "نظام العمل", article: 77, as_written: "المادة (77) من نظام العمل" },
    { law: "نظام العمل", article: 39 },
    { law: "نظام الاثبات", article: 5 },
    { law: "نظام العمل", article: 999 },
    { law: "نظام لا وجود له", article: 1 },
  ]));
  assert.deepEqual(out.map((r) => [r.article, r.status, r.missing ?? null]), [
    [77, "ok", null],
    [39, "amended", null],
    [5, "repealed", null],
    [999, "not_found", "article"],
    [1, "not_found", "law"],
  ]);
  assert.equal(out[0].url, "/laws/labor#labor__art-77");
  assert.equal(out[0].law_title, "نظام العمل لعام 1426هـ");
  assert.equal(out[0].cited, "المادة (77) من نظام العمل");
  assert.equal(out[2].law_title, "نظام الإثبات", "«الاثبات» found «الإثبات»");
});

test("a failed library read leaves its citations unchecked; the run is not failed", async () => {
  const cited = cleanCited([{ law: "نظام العمل", article: 77 }]);
  assert.equal((await checkCitations(fakeAdmin(LAWS, ARTICLES, "laws") as never, cited))[0].status, "unchecked");
  assert.equal((await checkCitations(fakeAdmin(LAWS, ARTICLES, "articles") as never, cited))[0].status, "unchecked");
});

test("enrichBriefCheck replaces the model's cited list with the library's citation_check", async () => {
  const out = await enrichBriefCheck(fakeAdmin(LAWS, ARTICLES) as never, {
    summary: "ملخص",
    findings: [],
    cited: [{ law: "نظام العمل", article: 77 }],
  });
  assert.equal(out.cited, undefined);
  assert.deepEqual((out.citation_check as Array<{ status: string }>).map((c) => c.status), ["ok"]);
  assert.equal(out.summary, "ملخص");
});
