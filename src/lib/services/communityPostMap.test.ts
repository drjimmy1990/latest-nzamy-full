import { test } from "node:test";
import assert from "node:assert/strict";
import { mapCommunityPost } from "./communityPostMap.ts";

test("a real Supabase post (no asker field at all) does not throw and gets an honest fallback", () => {
  assert.doesNotThrow(() => mapCommunityPost({ view_count: 312, vote_count: 24, created_at: "2026-09-01T10:00:00Z" }));
  const r = mapCommunityPost({ view_count: 312, vote_count: 24, created_at: "2026-09-01T10:00:00Z" });
  assert.equal(typeof r.asker, "string");
  assert.ok(r.asker.length > 0);
  assert.equal(r.isAnon, false);
  assert.equal(r.views, 312);
  assert.equal(r.votes, 24);
  assert.equal(r.ago, "2026-09-01T10:00:00Z");
});

test("a demo-mode StoredCommunityQuestion maps through its own fields unchanged", () => {
  const r = mapCommunityPost({ asker: "أحمد", askerType: "user", views: 10, votes: 2, ago: "منذ ساعة" });
  assert.equal(r.asker, "أحمد");
  assert.equal(r.isAnon, false);
  assert.equal(r.views, 10);
  assert.equal(r.votes, 2);
  assert.equal(r.ago, "منذ ساعة");
});

test("isAnon: demo asker containing مجهول is anonymous", () => {
  const r = mapCommunityPost({ asker: "مستخدم مجهول", askerType: "user" });
  assert.equal(r.isAnon, true);
});

test("isAnon: askerType guest is anonymous even without a مجهول marker in the name", () => {
  const r = mapCommunityPost({ asker: "زائر-3471", askerType: "guest" });
  assert.equal(r.isAnon, true);
});

test("isAnon: undefined asker (real row) never throws and is not anonymous by default", () => {
  const r = mapCommunityPost({});
  assert.equal(r.isAnon, false);
});
