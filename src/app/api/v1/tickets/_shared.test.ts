/**
 * _shared.test.ts — run with:  node --test src/app/api/v1/tickets/_shared.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { toTicketDto, validateTicketInput, ticketDbErrorResponse, type TicketRow } from "./_shared.ts";

const ROW: TicketRow = {
  id: "11111111-1111-1111-1111-111111111111",
  subject: "لا أستطيع تحميل المستند",
  body: "أحاول تحميل عقد الإيجار منذ الصباح ويظهر خطأ ٥٠٠.",
  category: "technical",
  priority: "high",
  status: "open",
  created_at: "2026-09-04T08:00:00.000Z",
  updated_at: "2026-09-04T08:00:00.000Z",
};

test("toTicketDto maps the DB row to the API DTO — body becomes message, camelCase timestamps", () => {
  const dto = toTicketDto(ROW);
  assert.deepEqual(dto, {
    id: ROW.id,
    subject: ROW.subject,
    message: ROW.body,
    category: "technical",
    priority: "high",
    status: "open",
    createdAt: ROW.created_at,
    updatedAt: ROW.updated_at,
  });
});

test("toTicketDto turns a null body into an empty message rather than null", () => {
  const dto = toTicketDto({ ...ROW, body: null });
  assert.equal(dto.message, "");
});

test("validateTicketInput accepts a complete, valid submission and trims whitespace", () => {
  const out = validateTicketInput({
    subject: "  لا أستطيع تحميل المستند  ",
    message: "  أحاول تحميل عقد الإيجار منذ الصباح ويظهر خطأ ٥٠٠.  ",
    category: "technical",
  });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.value.subject, "لا أستطيع تحميل المستند");
  assert.equal(out.value.message, "أحاول تحميل عقد الإيجار منذ الصباح ويظهر خطأ ٥٠٠.");
  assert.equal(out.value.category, "technical");
  assert.equal(out.value.priority, "normal", "defaults to normal when not sent");
});

test("validateTicketInput accepts an explicit valid priority", () => {
  const out = validateTicketInput({ subject: "abc", message: "abcde", category: "billing", priority: "urgent" });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.value.priority, "urgent");
});

test("validateTicketInput rejects a non-object body", () => {
  assert.equal(validateTicketInput(null).ok, false);
  assert.equal(validateTicketInput("hello").ok, false);
  assert.equal(validateTicketInput(undefined).ok, false);
});

test("validateTicketInput rejects a subject shorter than 3 or longer than 160 characters", () => {
  const tooShort = validateTicketInput({ subject: "ab", message: "abcde", category: "other" });
  assert.equal(tooShort.ok, false);
  if (tooShort.ok) return;
  assert.match(tooShort.error, /٣|3/);

  const tooLong = validateTicketInput({ subject: "a".repeat(161), message: "abcde", category: "other" });
  assert.equal(tooLong.ok, false);
});

test("a subject that is only whitespace is rejected (trimmed length counts)", () => {
  const out = validateTicketInput({ subject: "     ", message: "abcde", category: "other" });
  assert.equal(out.ok, false);
});

test("validateTicketInput rejects a message shorter than 5 or longer than 4000 characters", () => {
  const tooShort = validateTicketInput({ subject: "abc", message: "abcd", category: "other" });
  assert.equal(tooShort.ok, false);

  const tooLong = validateTicketInput({ subject: "abc", message: "a".repeat(4001), category: "other" });
  assert.equal(tooLong.ok, false);
});

test("boundary lengths are accepted (3, 160, 5, 4000)", () => {
  const min = validateTicketInput({ subject: "abc", message: "abcde", category: "other" });
  assert.equal(min.ok, true);
  const max = validateTicketInput({ subject: "a".repeat(160), message: "a".repeat(4000), category: "other" });
  assert.equal(max.ok, true);
});

test("validateTicketInput rejects a category outside the allowlist", () => {
  const out = validateTicketInput({ subject: "abc", message: "abcde", category: "refund" });
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.match(out.error, /technical/);
});

test("validateTicketInput rejects a missing category", () => {
  const out = validateTicketInput({ subject: "abc", message: "abcde" });
  assert.equal(out.ok, false);
});

test("validateTicketInput rejects an invalid explicit priority", () => {
  const out = validateTicketInput({ subject: "abc", message: "abcde", category: "other", priority: "medium" });
  assert.equal(out.ok, false, "the DB CHECK uses 'normal', not the old UI word 'medium'");
});

test("ticketDbErrorResponse maps known Postgres codes and falls back to 500", () => {
  assert.deepEqual(ticketDbErrorResponse({ code: "23505" }), { status: 409, message: "هذه التذكرة مسجَّلة مسبقاً." });
  assert.deepEqual(ticketDbErrorResponse({ code: "23514" }), { status: 400, message: "بيانات التذكرة غير صالحة." });
  assert.deepEqual(ticketDbErrorResponse({ code: "23503" }), { status: 400, message: "التذكرة تشير إلى سجلّ غير موجود." });
  assert.deepEqual(ticketDbErrorResponse({ code: "42501" }), { status: 403, message: "غير مصرح لك بهذا الإجراء." });
  assert.equal(ticketDbErrorResponse({ code: "99999" }).status, 500);
  assert.equal(ticketDbErrorResponse(null).status, 500);
});
