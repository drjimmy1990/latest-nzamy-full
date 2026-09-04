import { test } from "node:test";
import assert from "node:assert/strict";
import { mapCommunityAnswer } from "./communityAnswerMap.ts";

test("a real Supabase answer from a verified lawyer with a slug maps to a lawyer reply", () => {
  const r = mapCommunityAnswer({
    id: "a1",
    body: "الجواب القانوني هنا.",
    vote_count: 5,
    created_at: "2026-09-01T10:00:00Z",
    is_lawyer_verified: true,
    lawyerSlug: "ahmed-alghamdi",
  });
  assert.equal(r.type, "lawyer");
  assert.equal(r.isVerified, true);
  assert.equal(r.lawyerSlug, "ahmed-alghamdi");
  assert.equal(r.text, "الجواب القانوني هنا.");
  assert.equal(r.likes, 5);
  assert.equal(r.date, "2026-09-01T10:00:00Z");
});

test("a verified lawyer with no public slug still reads as a lawyer, but carries no link target", () => {
  const r = mapCommunityAnswer({
    id: "a2",
    body: "جواب آخر.",
    vote_count: 0,
    is_lawyer_verified: true,
    lawyerSlug: null,
  });
  assert.equal(r.type, "lawyer");
  assert.equal(r.isVerified, true);
  assert.equal(r.lawyerSlug, undefined);
});

test("is_lawyer_verified: false wins over a client-claimed authorType — the owner's :264/:304 line", () => {
  const r = mapCommunityAnswer({
    id: "a3",
    body: "رد عادي.",
    is_lawyer_verified: false,
    // A malicious/stale client body claiming lawyer status must not matter
    // once the server column is present.
    authorType: "lawyer",
    lawyerSlug: "someone",
  });
  assert.equal(r.type, "user");
  assert.equal(r.isVerified, false);
});

test("a demo-mode StoredCommunityAnswer (no server column) falls back to authorType", () => {
  const r = mapCommunityAnswer({
    id: 1,
    author: "أ. سارة",
    authorType: "lawyer",
    authorRating: 4.8,
    content: "نص تجريبي",
    votes: 3,
    isAccepted: true,
    ago: "منذ ساعة",
  });
  assert.equal(r.type, "lawyer");
  assert.equal(r.isVerified, true);
  assert.equal(r.author, "أ. سارة");
  assert.equal(r.text, "نص تجريبي");
  assert.equal(r.likes, 3);
  assert.equal(r.isBest, true);
  assert.equal(r.rating, 4.8);
  assert.equal(r.lawyerSlug, undefined);
});

test("an answer with no resolvable author name gets an honest fallback, never undefined", () => {
  const r = mapCommunityAnswer({ id: "a4", body: "بلا اسم", is_lawyer_verified: false });
  assert.equal(typeof r.author, "string");
  assert.ok(r.author.length > 0);
});

test("isBest falls back to comparing the answer id against the post's accepted_answer_id", () => {
  const accepted = mapCommunityAnswer({ id: "a5", body: "x", is_lawyer_verified: false }, "a5");
  const notAccepted = mapCommunityAnswer({ id: "a6", body: "x", is_lawyer_verified: false }, "a5");
  assert.equal(accepted.isBest, true);
  assert.equal(notAccepted.isBest, false);
});
