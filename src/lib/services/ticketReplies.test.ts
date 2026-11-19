/**
 * File 15 row 53 (A1, batch l9): a support reply is stored, kept and shown.
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/services/ticketReplies.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TICKET_REPLIES_MAX,
  TICKET_REPLY_MAX,
  keepReplies,
  replyDtos,
  storedReplies,
  validateReply,
  withReply,
} from "./ticketReplies.ts";

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

test("validateReply: trimmed text between 2 and 4000 characters", () => {
  assert.deepEqual(validateReply({ body: "  شكراً، تم الحل  " }), { ok: true, body: "شكراً، تم الحل" });
  assert.equal(validateReply({ body: " " }).ok, false);
  assert.equal(validateReply({ body: 5 }).ok, false);
  assert.equal(validateReply(null).ok, false);
  assert.equal(validateReply({ body: "x".repeat(TICKET_REPLY_MAX + 1) }).ok, false);
});

test("withReply appends and keeps the rest of the metadata; a full ticket refuses", () => {
  const meta = { user_name: "س", replies: [{ body: "أ", at: "2026-11-19T10:00:00Z", by: "s1" }] };
  const next = withReply(meta, { body: "ب", at: "2026-11-19T11:00:00Z", by: "s2" });
  assert.ok(next);
  assert.equal(next.user_name, "س");
  assert.equal((next.replies as unknown[]).length, 2);
  assert.equal(meta.replies.length, 1, "the input is not mutated");
  assert.ok(withReply(null, { body: "ج", at: "2026-11-19T11:00:00Z", by: null }));
  const full = { replies: Array.from({ length: TICKET_REPLIES_MAX }, () => ({ body: "x", at: "2026-11-19T10:00:00Z", by: null })) };
  assert.equal(withReply(full, { body: "y", at: "2026-11-19T11:00:00Z", by: null }), null);
});

test("the user sees text and time only — never which staff member replied; junk rows are skipped", () => {
  const meta = {
    replies: [
      { body: "الثاني", at: "2026-11-19T12:00:00Z", by: "staff-2" },
      { body: "الأول", at: "2026-11-19T10:00:00Z", by: "staff-1" },
      { body: "", at: "2026-11-19T10:00:00Z" },
      { body: "بلا وقت" },
      "x",
    ],
  };
  assert.deepEqual(replyDtos(meta), [
    { body: "الأول", at: "2026-11-19T10:00:00Z" },
    { body: "الثاني", at: "2026-11-19T12:00:00Z" },
  ]);
  assert.equal(storedReplies(meta)[0].by, "staff-1");
  assert.deepEqual(replyDtos({}), []);
  assert.deepEqual(replyDtos("x"), []);
});

test("keepReplies: a PATCH can neither overwrite nor add replies", () => {
  const existing = { a: 1, replies: [{ body: "r", at: "2026-11-19T10:00:00Z", by: null }] };
  assert.deepEqual(keepReplies(existing, { b: 2, replies: [] }), { a: 1, b: 2, replies: existing.replies });
  assert.deepEqual(keepReplies({ a: 1 }, { replies: [{ body: "fake" }] }), { a: 1 });
  assert.deepEqual(keepReplies(null, null), {});
});

test("wiring: the admin reply route, the PATCH guard, the user DTO and both screens", () => {
  const route = read("app/api/v1/admin/tickets/[id]/reply/route.ts");
  assert.match(route, /requireStaff\("tickets\.manage"\)/);
  assert.match(route, /\.eq\("updated_at", /, "compare-and-set on updated_at");
  assert.match(route, /logAdminAction\(/);
  assert.match(route, /recordNotification\(/);
  const patch = read("app/api/v1/admin/tickets/[id]/route.ts");
  assert.match(patch, /keepReplies\(/);
  const shared = read("app/api/v1/tickets/_shared.ts");
  assert.match(shared, /replies: replyDtos\(row\.metadata\)/);
  const admin = read("app/dashboard/admin/tickets/page.tsx");
  assert.match(admin, /value=\{replyText\}/);
  assert.match(admin, /onClick=\{sendReply\}/);
  assert.doesNotMatch(admin, /رد AI تلقائي/, "the button with no handler is gone");
  const help = read("app/settings/components/tabs/HelpTab.tsx");
  assert.match(help, /t\.replies/);
});
