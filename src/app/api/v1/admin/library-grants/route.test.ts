/**
 * route.test.ts — the «اشتراكات المكتبة» admin API (owner note ١٨ C03/C04).
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/app/api/v1/admin/library-grants/route.test.ts"
 * Source contracts (the routes import next/server and Supabase): the gate,
 * the server-side CSV, the reason, the order write → audit. The rules they
 * call are executed in src/lib/libraryAccessAdmin.test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const list = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");
const change = readFileSync(join(import.meta.dirname, "[id]", "route.ts"), "utf8");

test("the list (and its CSV) is gated by entitlements.grant before any read", () => {
  const gateAt = list.indexOf('await requireStaff("entitlements.grant")');
  const readAt = list.indexOf("createServiceClient()");
  assert.ok(gateAt > -1 && gateAt < readAt);
});

test("the CSV is built on the server with the BOM-carrying toCsv and sent as a download, never cached", () => {
  assert.ok(list.includes("toCsv(GRANT_CSV_HEADER"));
  assert.ok(list.includes('"Content-Type": "text/csv; charset=utf-8"'));
  assert.ok(list.includes('"Content-Disposition": `attachment;'));
  assert.ok(list.includes('"Cache-Control": "private, no-store"'));
  assert.ok(list.includes("CSV_MAX_ROWS"), "the export is bounded");
});

test("the list reads the admin's text from the side table and never filters on raw query values", () => {
  assert.ok(list.includes("library_access_grant_admin(reason, notes, revoke_reason, adjust_reason)"));
  assert.ok(list.includes("parseGrantListQuery(request.nextUrl.searchParams)"));
  assert.ok(!/searchParams\.get\(/.test(list), "every query value goes through parseGrantListQuery");
});

test("the holder search is bounded (.in() breaks past ~396 ids)", () => {
  assert.ok(list.includes(".limit(200)"));
  assert.ok(list.includes("ids.slice(i, i + 300)"));
});

test("revoke / end change: gate → body (reason mandatory) → one rpc → audit → notice", () => {
  const gateAt = change.indexOf('await requireStaff("entitlements.grant")');
  const parseAt = change.indexOf("parseGrantChangeBody(");
  const refuseAt = change.indexOf("if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });");
  const rpcAt = change.indexOf('admin.rpc("library_grant_revoke"');
  const adjAt = change.indexOf('admin.rpc("library_grant_adjust_end"');
  const logAt = change.indexOf("await logAdminAction({");
  const noticeAt = change.indexOf("await recordNotification({");
  assert.ok(gateAt > -1 && gateAt < parseAt && parseAt < refuseAt && refuseAt < rpcAt && rpcAt < adjAt);
  assert.ok(adjAt < logAt && logAt < noticeAt, "the audit row and the notice follow the write");
  assert.ok(change.includes("p_reason: change.reason"), "the reason reaches the database");
  assert.ok(change.includes('"library_grant_revoked" : "library_grant_adjusted"'));
  assert.ok(change.includes("const mapped = grantRpcError(error);"), "database refusals are mapped to Arabic");
});
