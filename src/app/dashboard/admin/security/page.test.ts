/**
 * page.test.ts — S6-T19 (slice A §1.6): the admin security page shows no
 * invented data. The two library tabs are real; the other four say «قريباً».
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/dashboard/admin/security/page.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("S6: no invented security data", () => {
  for (const banned of ["U-0005", "185.243", "٢.١%", "DUP_ACCOUNTS", "BLOCKED_IPS", "FAILED_LOGINS", "THREAT_TYPES", "trafficData", "بيانات توضيحية"]) {
    assert.ok(!src.includes(banned), `still contains ${banned}`);
  }
  assert.ok(src.includes("قريباً"));
  assert.ok(src.includes("قريباً — لا يجمع النظام هذه البيانات بعد"));
  assert.ok(src.includes("LibraryActivityPanel"));
  assert.ok(src.includes("LibraryLocksPanel"));
});

test("the real tabs stay, the library activity tab stays the default, and the four unbuilt tabs keep their place", () => {
  assert.match(src, /useState<SecTab>\("library_activity"\)/);
  for (const label of ["نشاط المكتبة", "قفل المكتبة", "نظرة عامة", "حسابات مكررة", "حماية البوتات", "التهديدات"]) {
    assert.ok(src.includes(label), label);
  }
  assert.match(src, /<LibraryActivityPanel isDark=\{isDark\} card=\{card\} \/>/);
  assert.match(src, /<LibraryLocksPanel isDark=\{isDark\} card=\{card\} \/>/);
  assert.doesNotMatch(src, /text-gray-(?:100|200)\b/);
});
