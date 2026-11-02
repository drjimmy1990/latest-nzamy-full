import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COURT_CHOICES, COURT_OTHER, resolveCourt } from "./courtTypes.ts";
import { courtDirectoryEntries, searchCourtOptions, NON_COURT_CATEGORIES, type CourtDirectoryRow } from "./courtSearch.ts";

const sample: CourtDirectoryRow[] = [
  { name: "المحكمة العامة بالرياض", category: "محكمة عامة", city: "الرياض" },
  { name: "المحكمة العامة بالهدار", category: "محكمة عامة", city: "الهدار" },
  { name: "المحكمة العامة بالهدار", category: "محكمة عامة", city: "الهدار" },
  { name: "محكمة التنفيذ بجدة", category: "محكمة تنفيذ", city: "جدة" },
  { name: "كتابة العدل الأولى بالرياض", category: "كتابة عدل", city: "الرياض" },
  { name: "وكالة الوزارة لشؤون التوثيق", category: "إدارة وفروع الوزارة", city: "الرياض" },
  { name: "المحكمة العمالية", category: "محاكم ودوائر قضائية", city: "الرياض" },
];

test("q351: the directory keeps courts only, one entry per name", () => {
  const d = courtDirectoryEntries(sample);
  assert.deepEqual(d.map((e) => e.name), ["المحكمة العامة بالرياض", "المحكمة العامة بالهدار", "محكمة التنفيذ بجدة", "المحكمة العمالية"]);
  assert.ok(d.every((e) => !NON_COURT_CATEGORIES.has(e.category)));
});

test("q351: an empty query lists the 14 classifications and no directory row", () => {
  const opts = searchCourtOptions("", courtDirectoryEntries(sample));
  assert.deepEqual(opts.map((o) => o.value), [...COURT_CHOICES]);
  assert.ok(opts.every((o) => o.kind === "type"));
});

test("q351: classifications come first, then directory courts; folding finds «جده» and «الرياض»", () => {
  const d = courtDirectoryEntries(sample);
  const opts = searchCourtOptions("التنفيذ", d);
  assert.deepEqual(opts.map((o) => `${o.kind}:${o.value}`), ["type:محكمة التنفيذ", "directory:محكمة التنفيذ بجدة"]);
  assert.deepEqual(searchCourtOptions("تنفيذ جده", d).map((o) => o.value), ["محكمة التنفيذ بجدة"]);
  assert.deepEqual(searchCourtOptions("العامة الرياض", d).map((o) => o.value), ["المحكمة العامة بالرياض"]);
  // a directory name equal to a classification is not offered twice
  assert.deepEqual(searchCourtOptions("العمالية", d).map((o) => `${o.kind}:${o.value}`), ["type:المحكمة العمالية"]);
});

test("q351: the directory part is capped", () => {
  const many: CourtDirectoryRow[] = Array.from({ length: 50 }, (_, i) => ({ name: `الدائرة الجزائية ${i + 1} بمكة`, category: "محكمة جزائية", city: "مكة" }));
  assert.equal(searchCourtOptions("الدائرة", courtDirectoryEntries(many), 30).length, 30);
});

test("q351: what is saved stays a plain string — a classification as itself, a directory pick or «أخرى» as its name", () => {
  assert.deepEqual(resolveCourt("المحكمة العامة", ""), { ok: true, court: "المحكمة العامة" });
  assert.deepEqual(resolveCourt(COURT_OTHER, "المحكمة العامة بالرياض"), { ok: true, court: "المحكمة العامة بالرياض" });
});

test("q351: the real directory file feeds the search (excluding notaries and ministry departments)", () => {
  const data = JSON.parse(readFileSync(new URL("../../../../data/circuits-directory.json", import.meta.url), "utf8")) as { circuits: CourtDirectoryRow[] };
  const d = courtDirectoryEntries(data.circuits);
  assert.ok(d.length > 1500, `${d.length}`);
  assert.equal(new Set(d.map((e) => e.name)).size, d.length);
  assert.ok(searchCourtOptions("الاستئناف", d).some((o) => o.kind === "directory"));
});
