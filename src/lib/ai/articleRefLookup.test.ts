/**
 * N11 (batch l12; the owner's RAW[55]): the article lookup inside the
 * drafter / contracts / case notes, and the citation preview of a drafter or
 * legal-opinion answer, skip the per-account library lock — titles, numbers
 * and the locked preview only, never a text the viewer may not read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  articleRefCheckUrl,
  articleRefLawPattern,
  articleRefLawsUrl,
  articleRefNumber,
  articleRefSlug,
  rankArticleRefLaws,
} from "./articleRefLookup.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("N11: the law pattern folds hamza / taa marbuta / alef maqsura and never carries the user's wildcards", () => {
  assert.equal(articleRefLawPattern("نظام العمل"), "%نظ_م%_لعمل%");
  assert.equal(articleRefLawPattern("الإجراءات الجزائية"), "%_ل_جر___ت%_لجز__ي_%");
  assert.equal(articleRefLawPattern("الاجراءات الجزائيه"), articleRefLawPattern("الإجراءات الجزائية"));
  assert.equal(articleRefLawPattern("50%_\\ نظام"), "%50%نظ_م%");
  assert.equal(articleRefLawPattern("ن"), null);
  assert.equal(articleRefLawPattern("  "), null);
  assert.equal(articleRefLawPattern(null), null);
});

test("N11: ranking — a title that starts with the query first, then the shorter; no duplicates; six at most", () => {
  const rows = [
    { slug: "b", title: "اللائحة التنفيذية لنظام العمل", type: "لائحة" },
    { slug: "a", title: "نظام العمل", type: "نظام" },
    { slug: "a", title: "نظام العمل", type: "نظام" },
    { slug: "", title: "x" },
  ];
  assert.deepEqual(rankArticleRefLaws(rows, "نظام العمل").map((r) => r.slug), ["a", "b"]);
  assert.equal(rankArticleRefLaws(Array.from({ length: 20 }, (_, i) => ({ slug: `s${i}`, title: `نظام ${i}` })), "نظام").length, 6);
  assert.deepEqual(rankArticleRefLaws(null, "x"), []);
});

test("N11: inputs and URLs", () => {
  assert.equal(articleRefNumber("80"), 80);
  assert.equal(articleRefNumber("0"), null);
  assert.equal(articleRefNumber("1.5"), null);
  assert.equal(articleRefNumber("10000"), null);
  assert.equal(articleRefSlug(" labor "), "labor");
  assert.equal(articleRefSlug("a\u0000b"), null);
  assert.equal(articleRefSlug("x".repeat(201)), null);
  assert.equal(articleRefLawsUrl("نظام العمل"), `/api/v1/ai/article-ref?q=${encodeURIComponent("نظام العمل")}`);
  assert.equal(articleRefCheckUrl("labor", 80), "/api/v1/ai/article-ref?law=labor&n=80");
});

test("wiring: the tool endpoint — signed in, the closed switch only, numbers and titles only, rate-limited", () => {
  const route = read("../../app/api/v1/ai/article-ref/route.ts");
  assert.match(route, /const gate = await libraryGate\(\{ accountLock: false \}\);/);
  assert.match(route, /requireApiUser\(supabase/);
  assert.match(route, /rateLimit\(`ai-article-ref:\$\{auth\.user\.id\}`, \{ limit: 60, windowMs: 60_000 \}\)/);
  assert.match(route, /\.from\("articles"\)\s*\.select\("number"\)/);
  assert.match(route, /\.from\("laws"\)\s*\.select\("slug, title, type"\)/);
  assert.doesNotMatch(route, /\btext\b\s*[,"]/, "no article text column is read");
  assert.doesNotMatch(route, /spendLibraryDocument|spendPublicView/, "nothing counted");
});

test("wiring: the drafter / opinion citation preview skips the account lock unless only the library assistant cited it", () => {
  const route = read("../../app/api/v1/ai/source-preview/route.ts");
  assert.match(route, /const gate = await libraryGate\(\{ accountLock: false \}\);/);
  assert.match(route, /\.select\("id, tool"\)/);
  assert.match(route, /isLibraryAiTool\(r\.tool\)/);
  assert.match(route, /const locked = await libraryAccountGate\(\);/);
  // The paywall rules are unchanged: the locked preview for a viewer without the library.
  assert.match(route, /const full = entitled && !deviceRefused;/);
  assert.match(route, /previewExcerpt\(a as Row, full\)/);
});
