import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { lawStatusForDetail, lawStatusPresentation } from "./law-status.ts";

const cases = [
  ["active", "ساري", "Active", "effective"],
  ["partially_active", "ساري جزئياً", "Partially active", "caution"],
  ["deferred_effective", "مؤجّل النفاذ", "Effectiveness deferred", "caution"],
  ["issued_publication_unverified", "صدر — لم يُتحقّق من النشر", "Issued — publication not verified", "caution"],
  ["suspended", "موقوف السريان", "Suspended", "caution"],
  ["repealed", "ملغى", "Repealed", "repealed"],
  ["superseded_duplicate", "نسخة مكررة مهجورة — النص المعتمد في أداة أخرى", "Superseded duplicate — see the authoritative document", "unverified"],
  ["merged_into_parent", "مدمج في الأداة الأم — ليس ملفاً مستقلاً", "Merged into parent — not an independent document", "unverified"],
] as const;

test("all eight schema lifecycle and archival statuses keep distinct, honest badges", () => {
  for (const [raw, ar, en, tone] of cases) {
    assert.equal(lawStatusForDetail(raw), raw);
    assert.deepEqual(lawStatusPresentation(raw), { labelAr: ar, labelEn: en, tone });
  }
});

test("missing, unknown, and obsolete tokens never assert activity or suspension", () => {
  for (const raw of [null, undefined, "", "  ", "status_undeclared", "partially_amended", "UNKNOWN", 0, "__proto__"]) {
    assert.equal(lawStatusForDetail(raw), "status_undeclared");
    assert.deepEqual(lawStatusPresentation(raw), {
      labelAr: "لم يُتحقّق من الحالة",
      labelEn: "Status not verified",
      tone: "unverified",
    });
  }
});

test("API, page, both sidebar card branches, and regulation status do not retain active fallbacks", () => {
  const api = readFileSync(new URL("../api/library/laws/[slug]/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("[slug]/page.tsx", import.meta.url), "utf8");
  const sidebar = readFileSync(new URL("[slug]/_sidebar.tsx", import.meta.url), "utf8");
  assert.match(api, /law_status: lawStatusForDetail\(law\.status\)/);
  assert.equal((api.match(/status: articleStatusForDetail\(r\.status\)/g) || []).length, 2);
  assert.match(page, /law_status: lawStatusForDetail\(data\.law_status\)/);
  assert.equal((sidebar.match(/\{renderLawStatus\(\)\}/g) || []).length, 2);
  assert.doesNotMatch(sidebar, /law\.law_status\s*\?\?\s*["']active["']/);
  assert.doesNotMatch(sidebar, /law\.law_status\s*===\s*["']repealed["].*"Suspended"/);
});
