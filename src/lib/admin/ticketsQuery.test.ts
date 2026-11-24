/**
 * Live check of 13 Nov, row 31: a user's «تذاكر الدعم» tab showed three
 * invented tickets for every account.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/admin/ticketsQuery.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTicketsQuery, ticketStatusAr, TICKETS_MAX_LIMIT } from "./ticketsQuery.ts";

const q = (s: string) => parseTicketsQuery(new URLSearchParams(s));
const UID = "11111111-2222-4333-8444-555555555555";

test("no parameters keeps the queue page's full list (no silent cap)", () => {
  assert.deepEqual(q(""), { ok: true, status: null, userId: null, limit: null });
});

test("user_id must be a uuid; status one of the four; limit 1..500", () => {
  assert.deepEqual(q(`user_id=${UID}&limit=50`), { ok: true, status: null, userId: UID, limit: 50 });
  assert.equal(q("user_id=not-a-uuid").ok, false);
  assert.equal(q("user_id=1 or 1=1").ok, false);
  assert.equal(q("status=open").ok, true);
  assert.equal(q("status=deleted").ok, false);
  assert.equal(q("limit=0").ok, false);
  assert.equal(q("limit=2.5").ok, false);
  const big = q("limit=100000");
  assert.ok(big.ok && big.limit === TICKETS_MAX_LIMIT);
});

test("every status has an Arabic word; an unknown one is a dash, never the raw key", () => {
  assert.deepEqual(["open", "pending", "resolved", "closed"].map(ticketStatusAr), ["مفتوحة", "قيد المتابعة", "محلولة", "مغلقة"]);
  assert.equal(ticketStatusAr("weird"), "—");
});

test("the route parses before it queries, and the user page reads the real tickets", () => {
  const route = readFileSync(new URL("../../app/api/v1/admin/tickets/route.ts", import.meta.url), "utf8");
  assert.match(route, /parseTicketsQuery\(new URL\(request\.url\)\.searchParams\)/);
  assert.match(route, /query\.eq\("user_id", parsed\.userId\)/);
  const page = readFileSync(new URL("../../app/dashboard/admin/users/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<UserTicketsPanel userId=\{userId\}/);
  for (const invented of ["#١٢٨", "#١٠٤", "#٨٩", "مشكلة في تصدير PDF"]) assert.equal(page.includes(invented), false, invented);
  const panel = readFileSync(new URL("../../app/dashboard/admin/users/[id]/_user-tickets.tsx", import.meta.url), "utf8");
  assert.match(panel, /\/api\/v1\/admin\/tickets\?user_id=\$\{encodeURIComponent\(userId\)\}/);
  assert.match(panel, /تعذّر تحميل تذاكر هذا المستخدم/);
});
