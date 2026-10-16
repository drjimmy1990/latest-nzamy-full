/**
 * N19 (fix plan 2026-10-16), community half: in demo mode the /community feed
 * lists the seed questions (ALL_QUESTIONS) beside this browser's own, but the
 * detail lookup read the browser's list only, so every seed card opened
 * «هذا السؤال غير موجود». Supabase mode is untouched (the API answers there).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { findDemoCommunityQuestion } from "./communityStore.ts";

const saved = [{ id: 1_760_000_000_000, title: "سؤالي" }];
const seed = [{ id: 1, title: "بذرة ١" }, { id: 2, title: "بذرة ٢" }];

test("a seed card's id finds the seed question", () => {
  assert.equal(findDemoCommunityQuestion(2, saved, seed)?.title, "بذرة ٢");
});

test("this browser's own question is found first", () => {
  assert.equal(findDemoCommunityQuestion(1_760_000_000_000, saved, seed)?.title, "سؤالي");
  assert.equal(findDemoCommunityQuestion(1, [{ id: 1, title: "محلي" }], seed)?.title, "محلي");
});

test("an id in neither list, or not a number, is not there", () => {
  assert.equal(findDemoCommunityQuestion(99, saved, seed), null);
  assert.equal(findDemoCommunityQuestion(Number("abc"), saved, seed), null);
});

test("getCommunityPost's demo branch reads the seed, the supabase branch still asks the API", () => {
  const service = readFileSync(new URL("./services/communityService.ts", import.meta.url), "utf8");
  assert.match(service, /import \{ ALL_QUESTIONS \} from "@\/constants\/communityData";/);
  const fn = service.slice(service.indexOf("export async function getCommunityPost("), service.indexOf("export async function createCommunityPost("));
  assert.match(fn, /if \(!isSupabaseMode\) \{\s*return findDemoCommunityQuestion\(\s*Number\(id\),\s*readCommunityQuestionsLocal\(\),\s*ALL_QUESTIONS as unknown as StoredCommunityQuestion\[\],/);
  assert.match(fn, /fetch\(`\/api\/v1\/community\/posts\/\$\{encodeURIComponent\(String\(id\)\)\}`/);
});
