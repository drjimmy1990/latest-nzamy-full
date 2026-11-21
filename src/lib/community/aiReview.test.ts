import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  REJECT_REASON_AR,
  aiRejectNoteAr,
  communityAiConfigured,
  communityAiReviewOn,
  communityReviewInput,
  readAiVerdict,
} from "./aiReview.ts";

const src = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

test("Q131a: the switch is OFF unless explicitly on (the workflow must be imported first)", () => {
  assert.equal(communityAiReviewOn({ enabled: true }), true);
  assert.equal(communityAiReviewOn(true), true);
  for (const v of [null, undefined, {}, { enabled: "true" }, { enabled: false }, false, "on"]) {
    assert.equal(communityAiReviewOn(v), false, JSON.stringify(v));
  }
  assert.equal(communityAiConfigured({ N8N_AI_BASE_URL: "https://n8n.example", NZAMY_AI_KEY: "k" }), true);
  assert.equal(communityAiConfigured({ N8N_AI_BASE_URL: " ", NZAMY_AI_KEY: "k" }), false);
});

test("the model sees only the masked title/body, trimmed — no author, no id", () => {
  const input = communityReviewInput("post", { title: "  عنوان ", body: "نص" });
  assert.deepEqual(input, { kind: "post", title: "عنوان", body: "نص" });
  assert.deepEqual(Object.keys(input!).sort(), ["body", "kind", "title"]);
  assert.equal(communityReviewInput("answer", { title: "", body: "   " }), null);
  assert.equal(communityReviewInput("answer", { body: "x".repeat(10000) })!.body.length, 6000);
});

test("readAiVerdict: fail closed — only approve, or reject with a known category, leave the human queue", () => {
  assert.deepEqual(readAiVerdict({ decision: "approve" }), { decision: "approve", category: null });
  assert.deepEqual(readAiVerdict({ result: { decision: "REJECT", category: "Spam" } }), { decision: "reject", category: "spam" });
  assert.equal(readAiVerdict({ decision: "reject" }).decision, "hold", "a rejection without a reason");
  assert.equal(readAiVerdict({ decision: "reject", category: "rude" }).decision, "hold");
  assert.equal(readAiVerdict({ decision: "publish" }).decision, "hold");
  for (const r of [null, "approve", 7, [], { status: "failed" }]) assert.equal(readAiVerdict(r).decision, "hold");
});

test("the author reads a fixed reason, never the model's words", () => {
  for (const c of Object.keys(REJECT_REASON_AR) as Array<keyof typeof REJECT_REASON_AR>) {
    const note = aiRejectNoteAr(c);
    assert.ok(note.startsWith(REJECT_REASON_AR[c]));
    assert.match(note, /مراجعة آلية قبل النشر/);
    assert.ok(note.length <= 500);
  }
});

test("server: guarded write (still pending + same updated_at), log row, no auto-answer", () => {
  const s = src("lib/community/aiReviewServer.ts");
  assert.match(s, /\.eq\("status", "pending_review"\)/);
  assert.match(s, /\.eq\("updated_at", r\.updated_at\)/);
  assert.match(s, /from\("community_ai_reviews"\)/);
  assert.match(s, /if \(!communityAiConfigured\(process\.env\)\) return;/);
  assert.doesNotMatch(s, /community_answers"\)\s*\.insert/, "the agent never writes an answer");
  assert.match(s, /body: \{ tool: "community-review", input \}/, "only the masked input is sent");
});

test("routes: posts POST, PATCH and answers POST run the review after the response, only when pending", () => {
  for (const rel of [
    "app/api/v1/community/posts/route.ts",
    "app/api/v1/community/posts/[id]/route.ts",
    "app/api/v1/community/posts/[id]/answers/route.ts",
  ]) {
    const s = src(rel);
    assert.match(s, /import \{ after, NextRequest, NextResponse \} from "next\/server";/, rel);
    assert.match(s, /after\(\(\) => runCommunityAiReview\(/, rel);
  }
});
