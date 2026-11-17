/**
 * community-question.test.ts — the readers' «اسأل في المجتمع» window posts a
 * real question (N05-L9 / owner F-22): its prefill, its submit rule, and its
 * links.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/app/laws/[slug]/community-question.test.ts"
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canPostCommunityQuestion,
  communityLoginHref,
  communityQuestionHref,
  communityQuestionPrefill,
  COMMUNITY_QUESTION_CATEGORIES,
} from "./_community-question.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("the details open with the law and the article", () => {
  assert.equal(communityQuestionPrefill("نظام العمل", "المادة الثمانون"), "بخصوص: نظام العمل — المادة الثمانون\n\n");
  assert.equal(communityQuestionPrefill("نظام العمل", ""), "بخصوص: نظام العمل\n\n");
  assert.equal(communityQuestionPrefill(undefined, null), "");
});

test("a title of more than ten characters and one of /community/ask's categories", () => {
  assert.deepEqual(COMMUNITY_QUESTION_CATEGORIES.map((c) => c.id), ["labor", "commercial", "civil", "criminal", "family", "real-estate"]);
  assert.equal(canPostCommunityQuestion("ما مدة التقادم في العمل؟", "labor"), true);
  assert.equal(canPostCommunityQuestion("قصير", "labor"), false);
  assert.equal(canPostCommunityQuestion("ما مدة التقادم في العمل؟", "other"), false);
  assert.equal(canPostCommunityQuestion("ما مدة التقادم في العمل؟", ""), false);
});

test("sign-in comes back to the page's path only; the new question's page by its id", () => {
  assert.equal(communityLoginHref("/laws/labor-law"), "/login?next=%2Flaws%2Flabor-law");
  assert.equal(communityLoginHref("/laws/a?q=x#y"), "/login?next=%2Flaws%2Fa");
  assert.equal(communityLoginHref("//evil.example"), "/login?next=%2F");
  assert.equal(communityQuestionHref(42), "/community/42");
  assert.equal(communityQuestionHref("3f2a-9b"), "/community/3f2a-9b");
  assert.equal(communityQuestionHref("../x"), "/community");
  assert.equal(communityQuestionHref(null), "/community");
});

test("the window posts through the community service, with no «قريباً» and no anonymous switch", () => {
  const src = fs.readFileSync(path.join(here, "_ai-components.tsx"), "utf8");
  const start = src.indexOf("export function CommunityQuestionModal(");
  const body = src.slice(start);
  assert.ok(start > 0);
  assert.match(src, /import \{ createCommunityPost \} from "@\/lib\/services\/communityService";/);
  assert.match(body, /await createCommunityPost\(/);
  assert.doesNotMatch(body, /قريباً|Coming Soon|نشر كمجهول|isAnon/);
});
