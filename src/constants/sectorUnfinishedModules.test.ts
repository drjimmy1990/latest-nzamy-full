import test from "node:test";
import assert from "node:assert/strict";
import {
  SECTOR_UNFINISHED,
  READINESS_CLAIM_WORDS,
  DEMO_SAMPLES_NOTE,
  NOT_FROM_YOUR_RECORDS_NOTE,
  unfinishedModulesFor,
  unfinishedModuleAt,
  MODULE_PAGE_NOTE,
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

test("a module page finds its entry by route; the micro wallet is real and not listed", () => {
  assert.equal(unfinishedModuleAt("/dashboard/firm/departments")?.name, "الأقسام والفروع");
  assert.equal(unfinishedModuleAt("/dashboard/ngo/compliance")?.name, "الامتثال والحوكمة");
  assert.equal(unfinishedModuleAt("/dashboard/micro/wallet"), null);
  assert.equal(unfinishedModuleAt("/dashboard/micro/requests"), null);
  const all = SECTORS.flatMap((s) => SECTOR_UNFINISHED[s].modules.flatMap((m) => m.hrefs));
  assert.equal(new Set(all).size, all.length, "a route belongs to one module only");
  for (const h of all) assert.match(h, /^\/dashboard\/(firm|government|ngo|micro)\//);
  assert.ok(!MODULE_PAGE_NOTE.includes("جاهز"));
});

test("no fee or commission figure appears anywhere in the copy", () => {
  for (const s of SECTORS) assert.ok(!/عمولة|%|٪/.test(allText(s)), `${s} mentions a fee`);
});
