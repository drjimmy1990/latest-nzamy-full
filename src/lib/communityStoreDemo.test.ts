/**
 * N19 (fix plan 2026-10-16), community half: in demo mode the /community feed
 * lists the seed questions (ALL_QUESTIONS) beside this browser's own, but the
 * detail lookup read the browser's list only, so every seed card opened
 * «هذا السؤال غير موجود». Supabase mode is untouched (the API answers there).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { findDemoCommunityQuestion, mergeDemoFeed, withDemoAnswer } from "./communityStore.ts";

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

// ── Owner decision ١١٥: demo is local only AND self-consistent ───────────────
// A seed card used to open (N19) but could not be answered: the answer path
// searched this browser's saved list only («تعذّر حفظ الإجابة: السؤال غير موجود»).

type Q = Parameters<typeof withDemoAnswer>[0][number];
const seedQ = [{ id: 2, title: "بذرة ٢", answers: [{ id: 9, body: "قديمة" }] }] as unknown as Q[];
const savedQ = [{ id: 1_760_000_000_000, title: "سؤالي", answers: [] }] as unknown as Q[];
const reply = { body: "إجابة تجريبية", author: "أ. اختبار" } as unknown as Parameters<typeof withDemoAnswer>[3];

test("answering a SEED question copies it into the saved list with the answer", () => {
  const r = withDemoAnswer(savedQ, seedQ, 2, reply, 42);
  assert.ok(r, "a seed question must be answerable in demo mode");
  assert.equal(r!.next.length, 2);
  const copy = r!.next.find((q) => q.id === 2)!;
  assert.equal(copy.isAnswered, true);
  assert.equal(copy.answers.length, 2, "the seed's own answers are kept, the new one is added");
  assert.equal(copy.answers[1].id, 42);
  assert.equal(seedQ[0].answers.length, 1, "the seed itself is not mutated");
});

test("answering a saved question updates it in place; an unknown id is null", () => {
  const r = withDemoAnswer(savedQ, seedQ, 1_760_000_000_000, reply, 7);
  assert.equal(r!.next.length, 1);
  assert.equal(r!.next[0].answers.length, 1);
  assert.equal(withDemoAnswer(savedQ, seedQ, 99, reply, 7), null);
});

test("the demo feed shows an answered seed once — the saved copy wins", () => {
  const saved = [{ id: 2, title: "نسخة مُجابة" }, { id: 5, title: "محلي" }];
  const seed = [{ id: 1, title: "بذرة ١" }, { id: 2, title: "بذرة ٢" }];
  assert.deepEqual(mergeDemoFeed(saved, seed).map((q) => q.title), ["نسخة مُجابة", "محلي", "بذرة ١"]);
});

test("addCommunityAnswer's demo branch passes the seed to the local store", () => {
  const service = readFileSync(new URL("./services/communityService.ts", import.meta.url), "utf8");
  const fn = service.slice(service.indexOf("export async function addCommunityAnswer("), service.indexOf("export async function voteCommunityPost("));
  assert.match(fn, /addCommunityAnswerLocal\(\s*Number\(postId\),\s*answer,\s*ALL_QUESTIONS as unknown as StoredCommunityQuestion\[\],/);
});
