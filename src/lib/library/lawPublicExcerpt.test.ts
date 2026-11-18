/**
 * Owner 18 Nov, item 4.1: a law's server-rendered page prints at most its
 * first article — only when a guest's reader shows it too — cleaned like the
 * reader's, and cut short. Never a locked article, never a repealed one's
 * superseded wording, never an audit note or a decree number.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/lawPublicExcerpt.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXCERPT_MAX_CHARS, firstArticleIsFree, lawPublicExcerpt } from "./lawPublicExcerpt.ts";
import { effectiveFreeLimit } from "./previewLimit.ts";

const FIRST = "يهدف هذا النظام إلى تنظيم العلاقة بين الأطراف.";

test("the first article is printed when a guest's free limit opens it (the formula, an override ≥ 1, a free law)", () => {
  // A 40-article law with the default cap: 3 free articles for a guest.
  assert.equal(effectiveFreeLimit({ freeLimit: 5 }, 40), 3);
  assert.equal(lawPublicExcerpt({ text: FIRST, status: "active" }, effectiveFreeLimit({ freeLimit: 5 }, 40)), FIRST);
  assert.equal(lawPublicExcerpt({ text: FIRST, status: "active" }, -1), FIRST);
  assert.equal(lawPublicExcerpt({ text: FIRST }, effectiveFreeLimit({ freeLimit: 1, freeLimitSource: "override" }, 40)), FIRST);
});

test("a locked first article is never printed (an admin override of 0)", () => {
  const limit = effectiveFreeLimit({ freeLimit: 0, freeLimitSource: "override" }, 40);
  assert.equal(limit, 0);
  assert.equal(firstArticleIsFree(limit), false);
  assert.equal(lawPublicExcerpt({ text: "نص مقفل لا يظهر للزائر", status: "active" }, limit), null);
});

test("a repealed or empty first article prints nothing (its substance is original_text, never read here)", () => {
  assert.equal(lawPublicExcerpt({ text: FIRST, status: "repealed" }, 3), null);
  assert.equal(lawPublicExcerpt({ text: "   ", status: "active" }, 3), null);
  assert.equal(lawPublicExcerpt(null, 3), null);
});

test("the corpus's audit notes never reach the HTML", () => {
  const out = lawPublicExcerpt({ text: `${FIRST}\nتصحيح 2026-08-14 (جولة تدقيق منهجي): راجع سجل المشاكل ف1072`, status: "active" }, 3);
  assert.ok(out);
  assert.doesNotMatch(out, /تصحيح 2026|سجل المشاكل/);
  assert.match(out, /يهدف هذا النظام/);
});

test("a long first article is cut to an excerpt — the HTML never carries more than a guest's reader", () => {
  const long = Array.from({ length: 200 }, (_, i) => `كلمة${i}`).join(" ");
  const out = lawPublicExcerpt({ text: long, status: "active" }, 3);
  assert.ok(out);
  assert.ok(out.length <= EXCERPT_MAX_CHARS + 1, `${out.length}`);
  assert.ok(out.endsWith("…"));
  assert.ok(long.startsWith(out.slice(0, -1)), "a prefix of the article, cut at a word");
});
