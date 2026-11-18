/**
 * Owner ٤٢ (batch l7 decision 13): review before publishing, names hidden,
 * «مكتب موثّق». The SQL half is proven by supabase/tests/rls/l7_community.test.sql.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OWN_POST_STATUSES,
  PUBLIC_POST_STATUSES,
  dbStatusesFor,
  isVerifiedOffice,
  moderationDecision,
  moderationStatusOf,
  postedNoticeAr,
  prepublishReviewOn,
  reviewNotificationAr,
  reviewStateOf,
} from "./review.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("the public feed lists published rows only; the author's own list adds his rows under review", () => {
  assert.deepEqual([...PUBLIC_POST_STATUSES], ["active", "closed"]);
  assert.deepEqual([...OWN_POST_STATUSES], ["active", "closed", "pending_review", "rejected"]);
  assert.equal(reviewStateOf("pending_review"), "pending");
  assert.equal(reviewStateOf("rejected"), "rejected");
  assert.equal(reviewStateOf("active"), null);
  assert.equal(reviewStateOf(undefined), null, "before 20261127_60 nothing is pending");
});

test("the setting is ON unless an admin set it to false (decision 13: default ON)", () => {
  assert.equal(prepublishReviewOn(true), true);
  assert.equal(prepublishReviewOn(false), false);
  assert.equal(prepublishReviewOn(null), true);
  assert.equal(prepublishReviewOn({ enabled: false }), false);
  assert.equal(prepublishReviewOn("false"), true, "only a real false switches it off");
});

test("the author is told honestly whether his text is public yet", () => {
  assert.match(postedNoticeAr("post", true), /بانتظار المراجعة/);
  assert.match(postedNoticeAr("answer", true), /بانتظار المراجعة/);
  assert.doesNotMatch(postedNoticeAr("post", false), /المراجعة/);
});

test("the queue maps every DB status, and its filters cover them", () => {
  assert.equal(moderationStatusOf("pending_review"), "pending");
  assert.equal(moderationStatusOf("active"), "approved");
  assert.equal(moderationStatusOf("closed"), "approved");
  assert.equal(moderationStatusOf("moderated"), "escalated");
  assert.equal(moderationStatusOf("rejected"), "rejected");
  assert.equal(moderationStatusOf("deleted"), "rejected");
  assert.deepEqual(dbStatusesFor("pending"), ["pending_review"]);
  assert.deepEqual(dbStatusesFor("approved"), ["active", "closed"]);
  assert.equal(dbStatusesFor("all"), null);
});

test("a rejection needs a reason; each decision has its own audit label per kind", () => {
  assert.deepEqual(moderationDecision("post", "approve", undefined), {
    ok: true, status: "active", audit: "community_post_approved", note: null,
  });
  assert.equal(moderationDecision("answer", "reject", "  ").ok, false);
  assert.deepEqual(moderationDecision("answer", "reject", " خارج الموضوع "), {
    ok: true, status: "rejected", audit: "community_answer_rejected", note: "خارج الموضوع",
  });
  assert.equal((moderationDecision("post", "escalate", null) as { status: string }).status, "moderated");
  assert.equal((moderationDecision("post", "remove", null) as { status: string }).status, "deleted");
  assert.equal(moderationDecision("post", "publish-everything", null).ok, false);
  const long = moderationDecision("post", "reject", "س".repeat(900));
  assert.equal(long.ok && long.note?.length, 500);
});

test("the author's notification names no one and carries the reason", () => {
  const n = reviewNotificationAr("post", "rejected", "مكرر");
  assert.ok(n && n.body.includes("مكرر"));
  assert.ok(reviewNotificationAr("answer", "active", null));
  assert.equal(reviewNotificationAr("post", "moderated", null), null);
});

test("«مكتب موثّق» = verified CR + a verified practising lawyer whose licence is valid today", () => {
  const today = "2026-11-19";
  const lawyer = { verification: "verified", practising: true, inRegistry: false, registryExpiry: null, fileExpiry: "2027-01-01" };
  assert.equal(isVerifiedOffice({ firmVerification: "verified", lawyers: [lawyer] }, today), true);
  assert.equal(isVerifiedOffice({ firmVerification: "pending", lawyers: [lawyer] }, today), false, "no verified CR");
  assert.equal(isVerifiedOffice({ firmVerification: "verified", lawyers: [] }, today), false, "no lawyer");
  assert.equal(isVerifiedOffice({ firmVerification: "verified", lawyers: [{ ...lawyer, fileExpiry: "2026-11-18" }] }, today), false, "expired");
  assert.equal(isVerifiedOffice({ firmVerification: "verified", lawyers: [{ ...lawyer, verification: "pending" }] }, today), false);
  assert.equal(isVerifiedOffice({ firmVerification: "verified", lawyers: [{ ...lawyer, practising: false }] }, today), false, "a secretary is not a lawyer");
  // the registry decides when it knows the licence
  assert.equal(
    isVerifiedOffice({ firmVerification: "verified", lawyers: [{ ...lawyer, inRegistry: true, registryExpiry: "2026-01-01" }] }, today),
    false,
  );
  assert.equal(
    isVerifiedOffice({ firmVerification: "verified", lawyers: [{ ...lawyer, inRegistry: true, registryExpiry: "2027-06-01", fileExpiry: null }] }, today),
    true,
  );
  assert.equal(
    isVerifiedOffice({ firmVerification: "verified", lawyers: [{ ...lawyer, inRegistry: true, registryExpiry: "2027-06-01", registryArchived: true }] }, today),
    false,
  );
});

test("routes: the feed is an allow-list, the detail route sends no profile slug, POST says pending", () => {
  const feed = read("app/api/v1/community/posts/route.ts");
  assert.ok(feed.includes('.in("status", mine ? [...OWN_POST_STATUSES] : [...PUBLIC_POST_STATUSES])'));
  assert.equal(feed.includes('.neq("status", "deleted")'), false);
  assert.ok(feed.includes('postedNoticeAr("post", pendingReview)'));
  const detail = read("app/api/v1/community/posts/[id]/route.ts");
  assert.equal(detail.includes('.select("user_id, slug")'), false, "names hidden: no slug lookup");
  assert.ok(detail.includes('rpc("community_verified_office_users"'));
  const answers = read("app/api/v1/community/posts/[id]/answers/route.ts");
  assert.ok(answers.includes('postedNoticeAr("answer", pendingReview)'));
  const page = read("app/community/[id]/page.tsx");
  assert.equal(page.includes("/lawyers/${reply.lawyerSlug}"), false, "no profile link on an answer");
});

test("the moderation page shows no demo rows", () => {
  const page = read("app/dashboard/admin/community/moderation/page.tsx");
  assert.equal(page.includes("INITIAL_REPORTS"), false);
  assert.equal(page.includes("قريباً"), false);
});
