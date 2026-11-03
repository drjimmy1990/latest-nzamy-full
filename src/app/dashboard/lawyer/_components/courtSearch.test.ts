import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COURT_CHOICES, COURT_OTHER, courtClassOf, resolveCourt } from "./courtTypes.ts";
import {
  courtDirectoryEntries, directoryCourtClass, foldCourtName, isCourtRowName, searchCourtOptions, NON_COURT_CATEGORIES, type CourtDirectoryRow,
} from "./courtSearch.ts";

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

const realDirectory = () =>
  (JSON.parse(readFileSync(new URL("../../../../data/circuits-directory.json", import.meta.url), "utf8")) as { circuits: CourtDirectoryRow[] }).circuits;

test("review M1: no kept row of the real directory lacks «محكم / دائر / ديوان», and offices are gone", () => {
  const kept = courtDirectoryEntries(realDirectory());
  assert.equal(kept.filter((e) => !/محكم|دائر|ديوان/.test(foldCourtName(e.name))).length, 0);
  const names = new Set(kept.map((e) => e.name));
  for (const office of ["أخبار وزارة العدل", "الإدارة العامة لتقنية المعلومات", "إدارة مستودعات الاستئناف بالرياض", "كتابة عالدل الملهم"]) {
    assert.equal(names.has(office), false, office);
  }
  assert.equal(isCourtRowName("الادارة العامة لشؤون المحاكم العامة"), false);
  assert.equal(isCourtRowName("رئيس محكمة الاستئناف بمنطقة الجوف"), true);
});

test("review I1: real directory names are classed — appeal, criminal, general, personal status", () => {
  const byName = new Map(courtDirectoryEntries(realDirectory()).map((e) => [e.name, e.courtClass]));
  assert.equal(byName.get("محكمة الاستئناف بالشرقية"), "محكمة الاستئناف");
  assert.equal(byName.get("المحكمة الجزائية بالدمام"), "المحكمة الجزائية");
  assert.equal(byName.get("المحكمة العامة بقرية العليا"), "المحكمة العامة", "«العليا» in a town name is not the Supreme Court");
  assert.equal(byName.get("محكمة الأحوال الشخصية بالرياض"), "محكمة الأحوال الشخصية");
  assert.equal(byName.get("المحكمة العليا"), "المحكمة العليا");
  // a criminal CIRCUIT of an appeal court is an appeal case, whatever its category says
  assert.equal(directoryCourtClass({ name: "الدائرة الجزائية  الثلاثية الأولى بمحكمة الإستئناف بالمنطقة الشمالية", category: "محكمة جزائية" }), "محكمة الاستئناف");
  // every class is one of the 14 the board knows
  const classes = new Set([...byName.values()].filter((v): v is string => v !== null));
  for (const c of classes) assert.ok((COURT_CHOICES as readonly string[]).includes(c), c);
});

test("review I1: courtClassOf keeps today's reading for the 14 names and for free text; a saved class is read", () => {
  for (const c of COURT_CHOICES) assert.equal(courtClassOf(c), c);
  for (const free of ["لجنة الفصل في المنازعات المصرفية", "محكمة الاستئناف بجدة", "بانتظار تحديد الجهة", "", null, undefined]) {
    assert.equal(courtClassOf(free), null, String(free));
  }
  assert.equal(courtClassOf("محكمة الاستئناف بالشرقية", "محكمة الاستئناف"), "محكمة الاستئناف");
  // a legacy name wins over anything saved beside it; junk saved classes are ignored
  assert.equal(courtClassOf("المحكمة العمالية", "محكمة الاستئناف"), "المحكمة العمالية");
  assert.equal(courtClassOf("محكمة ما", "محكمة لا وجود لها"), null);
  assert.equal(courtClassOf("محكمة ما", 7), null);
});

test("review I1: the board reads the class everywhere a court decides something", () => {
  const data = readFileSync(new URL("../../../../constants/lawyerCasesData.ts", import.meta.url), "utf8");
  assert.match(data, /const courtClass = courtClassOf\(court, request\.metadata\?\.courtClass\)/);
  assert.match(data, /degree: courtToDegree\(courtClass\)/);
  const page = readFileSync(new URL("../cases/page.tsx", import.meta.url), "utf8");
  assert.match(page, /courtFilter !== "all" && courtClassOf\(c\.court, c\.courtClass\) !== courtFilter/);
  const modal = readFileSync(new URL("./AddCaseModal.tsx", import.meta.url), "utf8");
  assert.match(modal, /savedCourtClass = [^;]*courtClassOf\(courtResolved\.court, courtClass\)/);
  assert.match(modal, /\.\.\.\(savedCourtClass \? \{ courtClass: savedCourtClass \} : \{\}\)/);
});
