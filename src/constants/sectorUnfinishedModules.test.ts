import test from "node:test";
import assert from "node:assert/strict";
import {
  SECTOR_UNFINISHED,
  READINESS_CLAIM_WORDS,
  DEMO_SAMPLES_NOTE,
  NOT_FROM_YOUR_RECORDS_NOTE,
  unfinishedModulesFor,
  type UnfinishedSector,
} from "./sectorUnfinishedModules.ts";

const SECTORS: UnfinishedSector[] = ["firm", "government", "ngo", "micro"];

const allText = (s: UnfinishedSector) => {
  const c = SECTOR_UNFINISHED[s];
  return [c.title, c.intro, ...c.modules.flatMap((m) => [m.name, m.state])].join("\n");
};

test("LIVE-F07: every sector dashboard lists its unfinished modules, each with a plain state", () => {
  for (const s of SECTORS) {
    const c = unfinishedModulesFor(s);
    assert.ok(c.modules.length > 0, `${s} has no unfinished modules listed`);
    for (const m of c.modules) {
      assert.ok(m.name.trim().length > 0, `${s}: empty module name`);
      assert.ok(m.state.trim().length > 0, `${s}/${m.name}: empty state`);
    }
    const names = c.modules.map((m) => m.name);
    assert.equal(new Set(names).size, names.length, `${s}: duplicate module`);
  }
});

test("LIVE-F07: no general readiness claim survives in the copy", () => {
  for (const s of SECTORS) {
    const text = allText(s);
    for (const w of READINESS_CLAIM_WORDS) {
      assert.ok(!text.includes(w), `${s} copy contains the claim word «${w}»`);
    }
  }
  for (const w of READINESS_CLAIM_WORDS) {
    assert.ok(!DEMO_SAMPLES_NOTE.includes(w));
    assert.ok(!NOT_FROM_YOUR_RECORDS_NOTE.includes(w));
  }
});

test("real modules are not listed as unfinished", () => {
  const micro = SECTOR_UNFINISHED.micro.modules.map((m) => m.name).join("|");
  assert.ok(!/الطلبات|طلباتي/.test(micro), "micro requests are real");
  assert.ok(!/^العقود$|عقودي/.test(micro), "micro contracts are real");
  const firm = SECTOR_UNFINISHED.firm.modules.map((m) => m.name);
  for (const real of ["القضايا", "العملاء", "الفريق", "المكتبة القانونية"]) {
    assert.ok(!firm.includes(real), `firm ${real} is real`);
  }
});

test("the NGO governance checker is said to be a temporary calculation (LIVE-F19 entry point)", () => {
  const gov = SECTOR_UNFINISHED.ngo.modules.find((m) => m.name.includes("الحوكمة"));
  assert.ok(gov && gov.state.includes("حساب مؤقت"));
});

test("no fee or commission figure appears anywhere in the copy", () => {
  for (const s of SECTORS) assert.ok(!/عمولة|%|٪/.test(allText(s)), `${s} mentions a fee`);
});
