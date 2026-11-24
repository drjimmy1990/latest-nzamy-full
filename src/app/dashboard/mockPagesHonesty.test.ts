/**
 * File 15 row 27 (batch l9): «حذف بيانات وهمية من اللوحات» — every page here
 * drew fixed rows as if they were the account's own. Outside demo mode each
 * now renders DashboardComingSoon, and every sidebar row to it says «قريباً».
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/dashboard/mockPagesHonesty.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const GATED = [
  "provider", "provider/arbitration/awards", "provider/arbitration/cases", "provider/arbitration/drafts",
  "provider/arbitration/files", "provider/arbitration/hearings", "provider/arbitration/parties",
  "provider/bailiff/requests", "provider/calendar", "provider/earnings", "provider/notary/drafts",
  "provider/notary/requests", "provider/profile", "provider/reviews",
  "government/cases", "government/compliance", "government/contracts", "government/external-counsel", "government/reports",
  "ngo/contracts", "ngo/finance", "ngo/programs", "ngo/reports",
  "micro/cases", "micro/documents",
  "firm/achievements", "firm/team/attendance", "firm/team/trainees", "firm/health-check",
  "firm/analytics", "firm/client-portal", "firm/departments", "firm/branches", "firm/of-counsel", "firm/shared-rooms", "firm/profile",
  "admin/disputes", "admin/payouts", "admin/celebrities", "admin/celebrities/referrals", "admin/celebrities/upgrade",
];

const page = (rel: string) => readFileSync(new URL(`./${rel}/page.tsx`, import.meta.url), "utf8");

test("each page answers «قريباً» outside demo mode, before any fixed row is drawn", () => {
  for (const rel of GATED) {
    const src = page(rel);
    const m = /export default function (\w+)\(\) \{\s*if \(!isDemoMode\) \{\s*return \(\s*<DashboardComingSoon/.exec(src);
    assert.ok(m, `${rel}: the default export does not open with the «قريباً» gate`);
    assert.match(src, new RegExp(`return <${m[1]}Demo />;`), rel);
    assert.match(src, /import \{[^}]*\bisDemoMode\b[^}]*\} from "@\/lib\/runtimeMode"/, rel);
  }
});

test("admin subscriptions shows no invented trend, churn or ARPU offset", () => {
  const src = page("admin/subscriptions");
  for (const s of ["+12% هذا الشهر", "+٥ هذا الأسبوع", "٦.٢%", "totalUsers - 42", "↓ تحسن"]) assert.ok(!src.includes(s), s);
});

test("the firm roles page no longer prints the literal member counts", () => {
  assert.ok(!/\{role\.memberCount\} \{role\.memberCount > 1/.test(page("firm/team/roles")));
});
