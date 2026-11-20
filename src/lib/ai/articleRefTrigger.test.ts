/**
 * articleRefTrigger.test.ts — N06-40..43 (batch l11): «@مادة» / «[[» in the
 * memo, contract and case editors.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/articleRefTrigger.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { articleCheckUrl, articleFound, findTrigger, lawOptions, parseRefQuery, referenceText, replaceTrigger } from "./articleRefTrigger.ts";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

test("findTrigger: «[[» and «@مادة» before the cursor, on the same line, not closed", () => {
  const v = "وحيث إن المدعي [[نظام العمل ٨٠";
  assert.deepEqual(findTrigger(v, v.length), { start: v.indexOf("[["), query: "نظام العمل ٨٠" });
  const w = "انظر @مادة 77 من نظام العمل";
  assert.deepEqual(findTrigger(w, w.length), { start: w.indexOf("@"), query: "77 من نظام العمل" });
  assert.equal(findTrigger("نص [[قديم]] ثم كلام", 18), null, "a closed «[[…]]» is not a trigger");
  assert.equal(findTrigger("[[نظام\nالعمل", 12), null, "not across lines");
  assert.equal(findTrigger("بريد name@مادة", 14), null, "«@مادة» inside a word is not a trigger");
  assert.equal(findTrigger("نص عادي", 7), null);
  // The cursor decides: text after it is ignored.
  assert.deepEqual(findTrigger("[[نظام العمل ثم", 12), { start: 0, query: "نظام العمل" });
  // Too far back: not a trigger.
  assert.equal(findTrigger(`[[${"س".repeat(100)}`, 102), null);
});

test("parseRefQuery: the number and the law's words, in any order and digits", () => {
  assert.deepEqual(parseRefQuery("نظام العمل ٨٠"), { number: 80, lawQuery: "نظام العمل" });
  assert.deepEqual(parseRefQuery("77 من نظام العمل"), { number: 77, lawQuery: "نظام العمل" });
  assert.deepEqual(parseRefQuery("المادة (١٢) نظام المرور"), { number: 12, lawQuery: "نظام المرور" });
  assert.deepEqual(parseRefQuery("نظام الشركات"), { number: null, lawQuery: "نظام الشركات" });
  assert.deepEqual(parseRefQuery(""), { number: null, lawQuery: "" });
});

test("referenceText / replaceTrigger: the typed shortcut becomes the reference, the cursor after it", () => {
  assert.equal(referenceText("نظام العمل", 80), "المادة (٨٠) من نظام العمل");
  assert.equal(referenceText(" نظام العمل ", null), "نظام العمل");
  const v = "وحيث إن [[نظام العمل ٨٠ يقضي";
  const start = v.indexOf("[[");
  const caret = v.indexOf(" يقضي");
  const r = replaceTrigger(v, start, caret, "المادة (٨٠) من نظام العمل");
  assert.equal(r.value, "وحيث إن المادة (٨٠) من نظام العمل يقضي");
  assert.equal(r.caret, start + "المادة (٨٠) من نظام العمل".length);
});

test("lawOptions: laws only, deduplicated, capped; articleFound reads the lookup", () => {
  const body = {
    topMatches: [
      { section: "laws", slug: "labor", title: "نظام العمل", lawType: "نظام" },
      { section: "laws", slug: "labor", title: "نظام العمل" },
      { section: "precedents", slug: "p", title: "مبدأ" },
      { section: "laws", slug: "", title: "x" },
      { section: "laws", slug: "labor-reg", title: "اللائحة التنفيذية لنظام العمل" },
    ],
  };
  assert.deepEqual(lawOptions(body), [
    { slug: "labor", title: "نظام العمل", lawType: "نظام" },
    { slug: "labor-reg", title: "اللائحة التنفيذية لنظام العمل", lawType: null },
  ]);
  assert.deepEqual(lawOptions(null), []);
  assert.equal(articleCheckUrl("labor", 80), "/api/library/laws/labor/citations?law=labor&n=80");
  assert.equal(articleFound({ articles: [{ id: "a", number: 80 }] }, 80), true);
  assert.equal(articleFound({ articles: [] }, 80), false);
});

test("the memo, contract and case editors carry the shortcut next to «إدراج من المكتبة»", () => {
  for (const [path, ref] of [
    ["src/components/draft/steps/StepAiDraft.tsx", "factsRef"],
    ["src/components/contracts/steps/draft/StepContext.tsx", "descRef"],
    ["src/app/dashboard/lawyer/cases/[id]/page.tsx", "newNoteRef"],
  ] as const) {
    const src = read(path);
    assert.match(src, new RegExp(`<ArticleRefAssist isDark=\\{isDark\\} targetRef=\\{${ref}\\}`), path);
  }
  const c = read("src/components/ai/ArticleRefAssist.tsx");
  assert.match(c, /\/api\/library\/autocomplete\?q=/);
  assert.match(c, /articleCheckUrl\(/);
  assert.match(c, /fitsLimit\(/);
});
