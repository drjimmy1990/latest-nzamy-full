/**
 * founderAdmin.test.ts — the admin «حملة المؤسس» panel's pure rules (P3 Task 10):
 * the summary row, the «بانتظار استرداد» list, the members (credits from ACTIVE
 * seats only), the sale PATCH body and its capacity floor, and the R24 retry
 * («إعادة محاولة التفعيل») guard and answer mapping.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/membership/founderAdmin.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeFounderCampaignSetting } from "../pricing/campaigns.ts";
import {
  FOUNDER_REFUND_LABEL_AR,
  activationAnswer,
  activationRetryIssue,
  founderAdminSummaryFromRpc,
  founderCapacityFloorIssue,
  founderMembers,
  founderRefundCase,
  founderRefundOrders,
  outcomeFromFulfil,
  parseFounderSalePatch,
  riyadhDayStartIso,
  saleStateAr,
  saleToggleCopy,
} from "./founderAdmin.ts";

const order = (over: Record<string, unknown> = {}) => ({
  id: "o-1",
  user_id: "u-1",
  kind: "membership",
  status: "paid",
  total_halalas: 344540,
  refunded_halalas: 0,
  receipt_number: "R-1",
  paid_at: "2026-11-05T10:00:00Z",
  fulfilled_at: "2026-11-05T10:00:05Z",
  live: true,
  metadata: { founder: "seat_unavailable", already_entitled: true },
  ...over,
});

// ── summary ──────────────────────────────────────────────────────────────────

test("the summary row: PostgREST's array or the bare row; anything malformed is null", () => {
  const row = { capacity: 1096, active: 10, reserved: 2, seats_left: 1084, sale_paused: false, on_sale: true };
  const want = { capacity: 1096, active: 10, reserved: 2, seatsLeft: 1084, salePaused: false, onSale: true };
  assert.deepEqual(founderAdminSummaryFromRpc([row]), want);
  assert.deepEqual(founderAdminSummaryFromRpc(row), want);
  assert.equal(founderAdminSummaryFromRpc([]), null);
  assert.equal(founderAdminSummaryFromRpc(null), null);
  assert.equal(founderAdminSummaryFromRpc([{ ...row, active: "10" }]), null);
  assert.equal(founderAdminSummaryFromRpc([{ ...row, sale_paused: null }]), null);
});

test("the sale state reads paused first, then the code switch, then the SQL's on_sale", () => {
  const s = { capacity: 10, active: 1, reserved: 0, seatsLeft: 9, salePaused: false, onSale: true };
  assert.equal(saleStateAr(s, true), "معروض للبيع");
  assert.equal(saleStateAr({ ...s, salePaused: true, onSale: false }, true), "البيع متوقف مؤقتًا");
  assert.equal(saleStateAr(s, false), "البيع مغلق في الشيفرة");
  assert.equal(saleStateAr({ ...s, seatsLeft: 0, onSale: false }, true), "اكتملت المقاعد");
  assert.equal(saleStateAr({ ...s, onSale: false }, true), "خارج فترة الحملة");
  assert.equal(saleStateAr(null, true), "—");
});

// ── the refund list ──────────────────────────────────────────────────────────

test("a refund case: a PAID membership order whose metadata.founder is one of R7's three reasons", () => {
  assert.equal(founderRefundCase(order()), "seat_unavailable");
  assert.equal(founderRefundCase(order({ metadata: { founder: "not_verified" } })), "not_verified");
  assert.equal(founderRefundCase(order({ metadata: { founder: "already_member" } })), "already_member");
  assert.equal(founderRefundCase(order({ metadata: { founder: "activated" } })), null, "activated is not a refund");
  assert.equal(founderRefundCase(order({ metadata: null })), null);
  assert.equal(founderRefundCase(order({ status: "refunded" })), null, "a refunded order leaves the list");
  assert.equal(founderRefundCase(order({ status: "voided" })), null);
  assert.equal(founderRefundCase(order({ kind: "plan" })), null);
});

test("the refund list: labelled «بانتظار استرداد», the buyer's name, newest payment first, retry only where it can help", () => {
  assert.equal(FOUNDER_REFUND_LABEL_AR, "بانتظار استرداد");
  const people = new Map([["u-1", { name: "أ. سعد", email: "s@x.sa" }]]);
  const list = founderRefundOrders(
    [
      order({ id: "a", paid_at: "2026-11-04T10:00:00Z" }),
      order({ id: "b", paid_at: "2026-11-06T10:00:00Z", metadata: { founder: "already_member" } }),
      order({ id: "c", metadata: { founder: "activated" } }),
      order({ id: "d", status: "refunded" }),
      order({ id: "e", user_id: "u-2", paid_at: "2026-11-05T10:00:00Z", metadata: { founder: "not_verified" }, live: false }),
    ],
    people,
  );
  assert.deepEqual(list.map((o) => o.id), ["b", "e", "a"]);
  assert.deepEqual(list[2], {
    id: "a",
    userId: "u-1",
    name: "أ. سعد",
    email: "s@x.sa",
    reason: "seat_unavailable",
    reasonAr: "اكتملت المقاعد قبل تأكيد الدفع",
    label: "بانتظار استرداد",
    totalHalalas: 344540,
    receiptNumber: "R-1",
    paidAt: "2026-11-04T10:00:00Z",
    live: true,
    canRetry: true,
  });
  assert.equal(list[0].canRetry, false, "already a member: a retry can only answer 'already'");

  // R26: a refund in flight (refund_job not 'retryable') hides the retry button
  const withJob = (state: string) =>
    founderRefundOrders([order({ metadata: { founder: "seat_unavailable", refund_job: { state } } })], people)[0];
  assert.equal(withJob("processing").canRetry, false, "a refund being processed");
  assert.equal(withJob("done").canRetry, false);
  assert.equal(withJob("retryable").canRetry, true, "a released claim can still be retried");
  assert.equal(
    founderRefundOrders([order({ metadata: { founder: "not_verified", refund_job: "junk" } })], people)[0].canRetry,
    true,
    "only an object job counts",
  );
  assert.equal(list[1].name, null, "an unknown buyer has no name");
  assert.equal(list[1].live, false);
});

// ── members ──────────────────────────────────────────────────────────────────

test("members: active seats only, credits from those seats only (a revoked seat's restored credit never shows)", () => {
  const seats = [
    { id: "s1", user_id: "u-1", order_id: "o-1", status: "active", activated_at: "2026-11-02T08:00:00Z", ends_at: "2027-11-02T08:00:00Z" },
    { id: "s2", user_id: "u-2", order_id: "o-2", status: "revoked", activated_at: "2026-11-03T08:00:00Z", ends_at: "2027-11-03T08:00:00Z" },
    { id: "s3", user_id: "u-3", order_id: "o-3", status: "active", activated_at: "2026-11-04T08:00:00Z", ends_at: "2027-11-04T08:00:00Z" },
    { id: "s4", user_id: "u-4", order_id: "o-4", status: "reserved", activated_at: null, ends_at: null },
  ];
  const credits = [
    { seat_id: "s1", kind: "drafting_work", total: 6, remaining: 4 },
    { seat_id: "s1", kind: "independent_output", total: 1, remaining: 0 },
    { seat_id: "s2", kind: "independent_output", total: 1, remaining: 1 },
    { seat_id: "s3", kind: "drafting_work", total: 6, remaining: 6 },
  ];
  const people = new Map([["u-1", { name: "أ. سعد", email: "s@x.sa" }]]);
  const members = founderMembers(seats, credits, people);
  assert.deepEqual(members.map((m) => m.seatId), ["s3", "s1"], "active only, newest activation first");
  assert.deepEqual(members[1], {
    seatId: "s1",
    userId: "u-1",
    orderId: "o-1",
    name: "أ. سعد",
    email: "s@x.sa",
    activatedAt: "2026-11-02T08:00:00Z",
    endsAt: "2027-11-02T08:00:00Z",
    credits: { draftingWork: { remaining: 4, total: 6 }, independentOutput: { remaining: 0, total: 1 } },
  });
  assert.deepEqual(members[0].credits, { draftingWork: { remaining: 6, total: 6 }, independentOutput: null });
  assert.equal(members[0].name, null);
});

// ── the sale PATCH ───────────────────────────────────────────────────────────

test("the sale body (R25): partial — salePaused and / or capacity, at least one, nothing else", () => {
  assert.deepEqual(parseFounderSalePatch({ salePaused: true }), { ok: true, patch: { sale_paused: true } });
  assert.deepEqual(parseFounderSalePatch({ capacity: 1200 }), { ok: true, patch: { capacity: 1200 } });
  assert.deepEqual(parseFounderSalePatch({ salePaused: false, capacity: 1200 }), {
    ok: true,
    patch: { sale_paused: false, capacity: 1200 },
  });
  const empty = parseFounderSalePatch({});
  assert.equal(empty.ok, false, "an empty body is refused");
  for (const bad of [
    null,
    [],
    "x",
    {},
    { salePaused: "true" },
    { capacity: 0 },
    { capacity: null },
    { salePaused: true, capacity: 0 },
    { salePaused: true, capacity: 12.5 },
    { salePaused: true, capacity: "100" },
    { salePaused: true, capacity: 100001 },
    { salePaused: true, extra: 1 },
    { sale_paused: true },
  ]) {
    const r = parseFounderSalePatch(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    if (!r.ok) assert.ok(r.error.length > 0);
  }
});

test("R25: only the keys sent are merged — a capacity save never touches a concurrent pause, and the reverse", () => {
  const stored = { starts_on: "2026-11-01", ends_on: "2027-01-25", library_days: 365, capacity: 1096, sale_paused: true };
  const cap = parseFounderSalePatch({ capacity: 1200 });
  assert.ok(cap.ok);
  if (cap.ok) {
    assert.equal("sale_paused" in cap.patch, false);
    assert.deepEqual(mergeFounderCampaignSetting(stored, cap.patch), { ...stored, capacity: 1200 });
  }
  const pause = parseFounderSalePatch({ salePaused: false });
  assert.ok(pause.ok);
  if (pause.ok) {
    assert.equal("capacity" in pause.patch, false);
    assert.deepEqual(mergeFounderCampaignSetting(stored, pause.patch), { ...stored, sale_paused: false });
  }
});

test("R25: the page posts { capacity } alone from the capacity field and { salePaused } alone from the switch", () => {
  const page = readFileSync(join(import.meta.dirname, "..", "..", "app", "dashboard", "admin", "founder", "page.tsx"), "utf8");
  assert.ok(page.includes("void patchSale({ capacity: n }"), "saveCapacity posts the capacity only");
  assert.ok(page.includes("void patchSale({ salePaused: copy.next }"), "the switch posts salePaused only");
  assert.equal(page.includes("salePaused: summary.salePaused"), false, "the last-loaded pause state is never re-sent");
});

test("capacity cannot go below active + reserved; equal is allowed", () => {
  const s = { active: 40, reserved: 5 };
  assert.equal(founderCapacityFloorIssue(45, s), null);
  assert.equal(founderCapacityFloorIssue(1096, s), null);
  const issue = founderCapacityFloorIssue(44, s);
  assert.ok(issue && issue.includes("45") && issue.includes("44"), String(issue));
});

test("today starts at Riyadh midnight, not UTC midnight", () => {
  // 22:30 UTC on 4 Nov is 01:30 on 5 Nov in Riyadh
  assert.equal(riyadhDayStartIso(new Date("2026-11-04T22:30:00Z")), "2026-11-05T00:00:00+03:00");
  assert.equal(riyadhDayStartIso(new Date("2026-11-04T12:00:00Z")), "2026-11-04T00:00:00+03:00");
});

// ── R24: the retry guard ─────────────────────────────────────────────────────

test("retry guard: only a paid membership order not yet activated, with no refund under way", () => {
  assert.equal(activationRetryIssue(order()), null);
  assert.equal(activationRetryIssue(order({ metadata: { founder: "not_verified" } })), null);
  assert.equal(activationRetryIssue(order({ metadata: { founder: "already_member" } })), null, "R24 only excludes activated");
  assert.equal(activationRetryIssue(order({ fulfilled_at: null, metadata: {} })), null, "a paid order still in fulfilment resumes");
  assert.equal(
    activationRetryIssue(order({ metadata: { founder: "seat_unavailable", refund_job: { state: "retryable" } } })),
    null,
    "a released refund claim does not block",
  );

  assert.equal(activationRetryIssue(null)?.status, 404);
  assert.equal(activationRetryIssue(order({ kind: "plan" }))?.status, 400);
  assert.equal(activationRetryIssue(order({ status: "refunded" }))?.status, 409);
  assert.equal(activationRetryIssue(order({ status: "failed" }))?.status, 409);
  assert.equal(activationRetryIssue(order({ metadata: { founder: "activated" } }))?.status, 409);
  assert.equal(activationRetryIssue(order({ refunded_halalas: 100 }))?.status, 409);
  assert.equal(
    activationRetryIssue(order({ metadata: { founder: "seat_unavailable", refund_job: { state: "processing" } } }))?.status,
    409,
    "a refund in flight blocks activation",
  );
  assert.equal(activationRetryIssue(order({ user_id: null }))?.status, 409);
  for (const o of [null, order({ kind: "plan" }), order({ metadata: { founder: "activated" } })]) {
    assert.ok((activationRetryIssue(o)?.error ?? "").length > 0);
  }
});

// ── R24: what founder_activate answered ──────────────────────────────────────

test("founder_activate's answers on a stamped refund order", () => {
  assert.deepEqual(
    [activationAnswer("activated", "activated").status, activationAnswer("activated", "activated").outcome],
    [200, "activated"],
  );
  const full = activationAnswer("full", "seat_unavailable");
  assert.deepEqual([full.status, full.outcome, full.reason], [409, "still_refund", "seat_unavailable"]);
  const nv = activationAnswer("not_verified", "not_verified");
  assert.deepEqual([nv.status, nv.outcome, nv.reason], [409, "still_refund", "not_verified"]);
  const member = activationAnswer("already", "already_member");
  assert.deepEqual([member.status, member.outcome, member.reason], [409, "still_refund", "already_member"]);
  const again = activationAnswer("already", "activated");
  assert.deepEqual([again.status, again.outcome], [200, "already_activated"], "a second click: nothing new");
  assert.equal(activationAnswer("already", "seat_unavailable").outcome, "failed", "a revoked seat is not an activation");
  assert.equal(activationAnswer("not_paid", null).status, 409);
  assert.equal(activationAnswer("???", null).status, 503);
  for (const a of [full, nv, member, again]) assert.ok(a.message.length > 0);
});

test("the resume path's answers on a paid order whose stamp never happened", () => {
  assert.equal(outcomeFromFulfil({ outcome: "granted" }, "activated").outcome, "activated");
  const refund = outcomeFromFulfil({ outcome: "already_done", reason: "already_entitled" }, "not_verified");
  assert.deepEqual([refund.status, refund.outcome, refund.reason], [409, "still_refund", "not_verified"]);
  assert.equal(outcomeFromFulfil({ outcome: "already_done" }, "activated").outcome, "already_activated");
  const busy = outcomeFromFulfil({ outcome: "pending", reason: "fulfilment_in_progress" }, null);
  assert.deepEqual([busy.status, busy.outcome], [409, "in_progress"]);
  assert.equal(outcomeFromFulfil({ outcome: "already_done", reason: "claimed_elsewhere" }, null).outcome, "in_progress");
  assert.equal(outcomeFromFulfil({ outcome: "pending", reason: "grant_failed" }, null).status, 503);
  assert.equal(outcomeFromFulfil({ outcome: "rejected", reason: "order_mismatch" }, null).status, 409);
});

test("the switch: the brief's two labels, a confirm question each, and the value it posts", () => {
  const live = saleToggleCopy(false);
  assert.deepEqual([live.button, live.next], ["إيقاف البيع مؤقتًا", true]);
  const paused = saleToggleCopy(true);
  assert.deepEqual([paused.button, paused.next], ["استئناف البيع", false]);
  for (const c of [live, paused]) assert.ok(c.confirm.endsWith(".") && c.confirm.includes("؟"));
});
