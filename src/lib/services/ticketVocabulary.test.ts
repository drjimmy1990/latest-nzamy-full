import test from "node:test";
import assert from "node:assert/strict";
import {
  TICKET_CATEGORIES, TICKET_CATEGORY_AR,
  TICKET_PRIORITIES, TICKET_PRIORITY_AR,
  TICKET_STATUSES, TICKET_STATUS_AR,
  isTicketCategory, isTicketPriority, isTicketStatus,
} from "./ticketVocabulary.ts";

test("every category, priority and status has an Arabic label — no raw token can reach a screen", () => {
  for (const c of TICKET_CATEGORIES) assert.ok(TICKET_CATEGORY_AR[c], c);
  for (const p of TICKET_PRIORITIES) assert.ok(TICKET_PRIORITY_AR[p], p);
  for (const s of TICKET_STATUSES) assert.ok(TICKET_STATUS_AR[s], s);
});

test("isTicketCategory accepts the allowlist and nothing invented by a caller", () => {
  assert.equal(isTicketCategory("billing"), true);
  assert.equal(isTicketCategory("refund"), false, "not in the allowlist");
  assert.equal(isTicketCategory(""), false);
  assert.equal(isTicketCategory(undefined), false);
  assert.equal(isTicketCategory(42), false);
});

test("isTicketPriority mirrors the support_tickets CHECK constraint", () => {
  assert.equal(isTicketPriority("urgent"), true);
  assert.equal(isTicketPriority("medium"), false, "the old screen-only word — the DB CHECK uses 'normal'");
  assert.equal(isTicketPriority(null), false);
});

test("isTicketStatus mirrors the support_tickets CHECK constraint", () => {
  assert.equal(isTicketStatus("resolved"), true);
  assert.equal(isTicketStatus("archived"), false);
});
