/**
 * route.test.ts — source contract for the F14 additions to GET
 * /api/v1/admin/founder/overview. The route imports next/server and the
 * Supabase clients, so it cannot run under `node --test`; the arithmetic is
 * executed in src/lib/membership/founderSaleStats.test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(import.meta.dirname, "route.ts"), "utf8").replace(/\r\n/g, "\n");
const code = SRC.split("\n")
  .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))
  .join("\n");
const PAGE = readFileSync(join(import.meta.dirname, "../../../../../dashboard/admin/founder/page.tsx"), "utf8");

test("staff only, through the existing guard; the money and the sources need payments.read", () => {
  assert.match(code, /const gate = await requireStaff\("read"\);\s*if \(!gate\.ok\) return gate\.response;/);
  assert.match(code, /const canSeeSales = staffMaySee\(gate\.role, "payments\.read"\);/);
  const gateAt = code.indexOf("if (canSeeSales) {");
  assert.ok(gateAt > 0 && code.indexOf("founderSaleStats(") > gateAt && code.indexOf('from("payment_webhook_events")') > gateAt);
  assert.match(code, /saleHidden: !canSeeSales,/);
});

test("server-side service-role reads; only metadata->attribution is selected, never the whole metadata (no e-mails)", () => {
  assert.match(code, /const service = await createServiceClient\(\);/);
  assert.match(code, /attribution:metadata->attribution/);
  const saleSelect = code.slice(code.indexOf("allRows<SaleOrderRow>"), code.indexOf('.eq("kind", "membership")', code.indexOf("allRows<SaleOrderRow>")));
  assert.doesNotMatch(saleSelect, /metadata"|metadata,|, metadata\b(?!->)/);
});

test("webhook problems: the shared filter, newest first, a bounded list", () => {
  assert.match(code, /\.or\(WEBHOOK_PROBLEM_FILTER\)\s*\.order\("received_at", \{ ascending: false \}\)\s*\.limit\(20\)/);
});

test("a failed sale read never takes the page down: saleError, the rest stays", () => {
  assert.match(code, /saleError = "تعذّر تحميل أرقام المبيعات ومصادرها\.";/);
  assert.doesNotMatch(code.slice(code.indexOf("if (canSeeSales) {"), code.indexOf("return NextResponse.json(\n      {")), /status: 503/);
});

test("the page shows the honest notes: live-only revenue, the untracked row, unrecorded forged webhooks", () => {
  assert.match(PAGE, /الإيراد \(مدفوعات حية فقط\)/);
  assert.match(PAGE, /\{UNTRACKED_AR\}/);
  assert.match(PAGE, /\{WEBHOOK_UNRECORDED_NOTE_AR\}/);
  assert.match(PAGE, /ضريبة القيمة المضافة/);
});
