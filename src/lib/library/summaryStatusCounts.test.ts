import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseSummaryStatusCount, summaryStatusLines, summaryStatusWarning } from "./summaryStatusCounts.ts";

test("B-50: counts are read defensively", () => {
  assert.deepEqual(parseSummaryStatusCount({ reviewed: 3, draft: 1.7, none: -2 }), { reviewed: 3, draft: 1, none: 0 });
  assert.equal(parseSummaryStatusCount(null), null);
  assert.equal(parseSummaryStatusCount([1, 2]), null);
});

test("B-50: one line per kind, and a kind that cannot be read says so", () => {
  const lines = summaryStatusLines({ laws: { reviewed: 12, draft: 3, none: 400 }, decrees: null });
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^الأنظمة واللوائح: مراجَع .+ · مسودة .+ · بلا حالة .+$/);
  assert.equal(lines[1], "القرارات والتعاميم: تعذّرت قراءة الحالات");
});

test("B-50: warn while a kind with summaries has none reviewed (switching on would hide them all)", () => {
  assert.equal(summaryStatusWarning({ laws: { reviewed: 5, draft: 0, none: 9 }, decrees: { reviewed: 2, draft: 0, none: 1 } }), null);
  assert.match(summaryStatusWarning({ laws: { reviewed: 5, draft: 0, none: 9 }, decrees: { reviewed: 0, draft: 0, none: 2300 } }) ?? "", /القرارات والتعاميم\. تشغيل الخيار الآن يخفي موجزاتها كلها\.$/);
  assert.match(summaryStatusWarning({ laws: null, decrees: { reviewed: 1, draft: 0, none: 0 } }) ?? "", /الأنظمة واللوائح/);
  // An empty table loses nothing.
  assert.equal(summaryStatusWarning({ laws: { reviewed: 0, draft: 0, none: 0 }, decrees: { reviewed: 1, draft: 0, none: 0 } }), null);
});

test("B-50: the route is staff-only, read-only, counts by status on both tables; the card shows it under the switch", () => {
  const route = readFileSync(new URL("../../app/api/v1/admin/library-summary-status/route.ts", import.meta.url), "utf8");
  assert.match(route, /const gate = await requireStaff\("read"\);\n?\r?\n?\s*if \(!gate\.ok\) return gate\.response;/);
  assert.doesNotMatch(route, /export async function (POST|PATCH|PUT|DELETE)/);
  assert.match(route, /select\("summary_status", \{ count: "exact", head: true \}\)/);
  assert.match(route, /\.eq\("summary_status", "reviewed"\)/);
  assert.match(route, /\.is\("summary_status", null\)/);
  assert.match(route, /countFor\(admin, "laws"\), countFor\(admin, "decrees_circulars"\)/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
  const card = readFileSync(new URL("../../app/dashboard/admin/settings/_library-rules.tsx", import.meta.url), "utf8");
  assert.match(card, /fetch\("\/api\/v1\/admin\/library-summary-status"/);
  assert.match(card, /summaryStatusWarning\(statusCounts\)/);
});
