/**
 * founderMembershipView.test.ts — what GET /api/v1/membership/founder answers
 * from the caller's own rows (P3 Task 6).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/membership/founderMembershipView.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { founderMembershipView, NOT_A_FOUNDER } from "./founderMembershipView.ts";

const NOW = new Date("2026-11-10T09:00:00Z");
const END = "2027-11-10T09:00:00.000Z";
const SEAT = { id: "seat-1", status: "active", ends_at: END };
const credits = (drafting: number, output: number, over: Record<string, unknown> = {}) => [
  { seat_id: "seat-1", kind: "drafting_work", total: 6, remaining: drafting, ends_at: END, ...over },
  { seat_id: "seat-1", kind: "independent_output", total: 1, remaining: output, ends_at: END, ...over },
];
const GRANT = { id: "g-1", plan_ref: "lib-founder", source: "founder_campaign", starts_at: "2026-11-10T08:00:00Z", ends_at: "2027-11-10T08:00:00Z" };

test("an active founder: end date, both credits with what is left, the library's last day", () => {
  const v = founderMembershipView({ seat: SEAT, credits: credits(4, 1), grants: [GRANT], now: NOW });
  assert.deepEqual(v, {
    member: true,
    endsAt: END,
    credits: { drafting_work: { total: 6, remaining: 4 }, independent_output: { total: 1, remaining: 1 } },
    libraryPoints: { total: 0, remaining: 0 },
    libraryUntil: "2027-11-10T08:00:00.000Z",
  });
});

test("no seat, a seat not active, or a seat past its end: not a member, zeros and nulls", () => {
  for (const seat of [null, { ...SEAT, status: "reserved" }, { ...SEAT, status: "revoked" }, { ...SEAT, ends_at: "2026-11-01T00:00:00Z" }, { ...SEAT, ends_at: null }]) {
    const v = founderMembershipView({ seat, credits: credits(6, 1), grants: [GRANT], now: NOW });
    assert.deepEqual(v, NOT_A_FOUNDER, JSON.stringify(seat));
  }
  assert.deepEqual(NOT_A_FOUNDER, {
    member: false,
    endsAt: null,
    credits: { drafting_work: { total: 0, remaining: 0 }, independent_output: { total: 0, remaining: 0 } },
    libraryPoints: { total: 0, remaining: 0 },
    libraryUntil: null,
  });
});

test("credits of another seat are ignored; an expired credit row leaves nothing to spend", () => {
  const other = { seat_id: "seat-0", kind: "drafting_work", total: 6, remaining: 6, ends_at: END };
  const v = founderMembershipView({ seat: SEAT, credits: [...credits(2, 0), other], grants: [], now: NOW });
  assert.deepEqual(v.credits, { drafting_work: { total: 6, remaining: 2 }, independent_output: { total: 1, remaining: 0 } });
  assert.equal(v.libraryUntil, null, "no library grant");
  const expired = founderMembershipView({ seat: SEAT, credits: credits(3, 1, { ends_at: "2026-11-09T00:00:00Z" }), grants: [], now: NOW });
  assert.deepEqual(expired.credits, { drafting_work: { total: 6, remaining: 0 }, independent_output: { total: 1, remaining: 0 } });
});

test("libraryUntil follows a stacked grant chain and ignores a grant that has not started", () => {
  const later = { ...GRANT, id: "g-2", plan_ref: "lib-annual", source: "request", starts_at: "2027-11-10T08:00:00Z", ends_at: "2028-11-10T08:00:00Z" };
  assert.equal(founderMembershipView({ seat: SEAT, credits: [], grants: [GRANT, later], now: NOW }).libraryUntil, "2028-11-10T08:00:00.000Z");
  assert.equal(founderMembershipView({ seat: SEAT, credits: [], grants: [later], now: NOW }).libraryUntil, null);
});

test("owner ٨ / ١٥ / ١٨: the library_question row is shown as points (×5), not as a credit; another seat's or an expired row adds nothing", () => {
  const q = (remaining: number, over: Record<string, unknown> = {}) =>
    ({ seat_id: "seat-1", kind: "library_question", total: 20, remaining, ends_at: END, ...over });
  const v = founderMembershipView({ seat: SEAT, credits: [...credits(6, 1), q(17)], grants: [], now: NOW });
  assert.deepEqual(v.libraryPoints, { total: 100, remaining: 85 });
  assert.deepEqual(v.credits, { drafting_work: { total: 6, remaining: 6 }, independent_output: { total: 1, remaining: 1 } });
  const other = founderMembershipView({ seat: SEAT, credits: [q(20, { seat_id: "seat-0" })], grants: [], now: NOW });
  assert.deepEqual(other.libraryPoints, { total: 0, remaining: 0 });
  const expired = founderMembershipView({ seat: SEAT, credits: [q(20, { ends_at: "2026-11-09T00:00:00Z" })], grants: [], now: NOW });
  assert.deepEqual(expired.libraryPoints, { total: 100, remaining: 0 });
  const revoked = founderMembershipView({ seat: { ...SEAT, status: "revoked" }, credits: [q(20)], grants: [], now: NOW });
  assert.deepEqual(revoked.libraryPoints, { total: 0, remaining: 0 });
  // an unknown kind is skipped, never counted as a credit
  const odd = founderMembershipView({ seat: SEAT, credits: [{ seat_id: "seat-1", kind: "bonus", total: 9, remaining: 9, ends_at: END }], grants: [], now: NOW });
  assert.deepEqual(odd.credits, { drafting_work: { total: 0, remaining: 0 }, independent_output: { total: 0, remaining: 0 } });
  assert.deepEqual(odd.libraryPoints, { total: 0, remaining: 0 });
});
