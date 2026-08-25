import { test } from "node:test";
import assert from "node:assert/strict";
import { canRequesterCancel } from "./orderTransitions.ts";

test("a client may cancel an order that has not been worked yet", () => {
  assert.equal(canRequesterCancel("pending_assignment"), true);
});

test("a client may cancel an unpaid order", () => {
  // `pending_payment` is not a hypothetical: booking an AI consultation at
  // /dashboard/client/consultation/new creates an `ai_workspace` row in
  // exactly this status (page.tsx:164-165 — on the AI path that ternary is
  // always "pending_payment"), and there is no payment provider in this
  // codebase to move it out. Dropping it from the allow-list would 403 a
  // cancel that works today, which is a regression, not the lock س٢ asked
  // for.
  assert.equal(canRequesterCancel("pending_payment"), true);
});

test("a client may cancel an order the admin has claimed but not delivered", () => {
  assert.equal(canRequesterCancel("assigned"), true);
  assert.equal(canRequesterCancel("in_review"), true);
});

test("a client may NOT cancel a delivered order", () => {
  assert.equal(canRequesterCancel("completed"), false);
});

test("a client may NOT re-cancel an already cancelled order", () => {
  assert.equal(canRequesterCancel("cancelled"), false);
});

test("a client may cancel their own draft", () => {
  // `draft` is in the allow-list to keep the server a superset of every
  // client cancel gate: the unified «طلباتي» page offers a cancel button on
  // `draft` (requests/page.tsx:213 card, :483 modal), and a button the server
  // 403s is exactly what this module exists to prevent. A draft is by
  // definition not delivered, so this does not weaken owner decision س٢ — and
  // it cannot launder a delivered order, because a requester can never PATCH
  // an `ai_workspace` row INTO `draft` (that branch permits only the target
  // "cancelled"). See the module comment.
  assert.equal(canRequesterCancel("draft"), true);
});

test("an unknown status is refused rather than allowed", () => {
  // Fail closed: a status this function does not model must not be
  // cancellable by default, or a future status silently reopens the hole.
  // `draft` used to carry this property and no longer does, so pin it on a
  // status that is genuinely unmodelled instead.
  assert.equal(canRequesterCancel("foo"), false);
  assert.equal(canRequesterCancel(""), false);
});
