/**
 * Source pins for the owner package of 2026-10-30 (validation, uploads,
 * document opening and honest screens). The pure modules have their own
 * tests; these pin that the routes and screens actually use them, so a later
 * edit cannot quietly drop the check while every unit test stays green.
 * Ledger: docs/audits/2026-10-30-owner-package-validation-honesty.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = join(import.meta.dirname, "../..");
const read = (f: string) => readFileSync(join(src, f), "utf8");
/** Source with // line comments and block comments removed. */
const code = (f: string) =>
  read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");

test("LIVE-F39: contract party routes check phone and email on the server", () => {
  const post = code("app/api/v1/lawyer/contracts/[id]/parties/route.ts");
  assert.match(post, /checkContactPair\(/);
  const patch = code("app/api/v1/lawyer/contracts/[id]/parties/[pid]/route.ts");
  assert.match(patch, /checkSaudiPhone\(/);
  assert.match(patch, /checkOptionalEmail\(/);
  assert.match(code("app/dashboard/lawyer/_components/contracts/ContractChildForms.tsx"), /contactFieldRules/);
});

test("LIVE-F22: client routes and screens use the one shared validator", () => {
  assert.match(code("app/api/v1/lawyer/clients/route.ts"), /checkContactPair\(/);
  const patch = code("app/api/v1/lawyer/clients/[id]/route.ts");
  assert.match(patch, /checkSaudiPhone\(/);
  assert.match(patch, /checkOptionalEmail\(/);
  for (const f of [
    "components/dashboard/lawyer/AddClientModal.tsx",
    "app/dashboard/lawyer/clients/[id]/page.tsx",
    "app/dashboard/ngo/volunteers/new/page.tsx",
  ]) assert.match(code(f), /@\/lib\/services\/contactFieldRules/, f);
});

test("LIVE-F40 / CODE-F39: the versions route checks the stored bytes and removes a bad object", () => {
  const route = code("app/api/v1/lawyer/contracts/[id]/versions/route.ts");
  assert.match(route, /readStoredObjectHead\(/);
  assert.match(route, /validateContractVersionFile\(/);
  const check = route.indexOf("validateContractVersionFile(");
  const remove = route.indexOf(".remove([storagePath])");
  const insert = route.indexOf(".insert(");
  assert.ok(remove > check, "the object is removed after a failed check");
  assert.ok(insert > remove, "no row is written before the check");
  const svc = code("lib/services/contractsService.ts");
  assert.match(svc, /uploadThenRegister\(/);
  assert.match(code("app/dashboard/lawyer/_components/contracts/UploadVersionModal.tsx"), /precheckContractVersionFile|CONTRACT_VERSION_LIMIT_NOTE/);
});

test("CODE-F38: no window.open(url) after an await in the document handlers", () => {
  for (const f of [
    "app/dashboard/lawyer/documents/page.tsx",
    "app/dashboard/lawyer/cases/[id]/page.tsx",
    "app/dashboard/lawyer/_components/contracts/ContractDetail.tsx",
  ]) {
    const s = code(f);
    assert.match(s, /openPendingTab\(window\)/, f);
    assert.doesNotMatch(s, /window\.open\(\s*(?!["']about:blank)/, `${f} still calls window.open with a URL`);
  }
});

test("CODE-F42: the services list re-reads after a failed read", () => {
  const s = code("app/dashboard/lawyer/profile/page.tsx");
  assert.match(s, /mergeSavedRow\(/);
  assert.match(s, /mergeDeletedRow\(/);
  assert.match(s, /loadServices\(\)/);
});

test("CODE-F26: the profile-row route is lawyer-only and never sets verification", () => {
  const s = code("app/api/v1/lawyer/profile-row/route.ts");
  assert.match(s, /assertRole\(\["lawyer"\]\)/);
  assert.match(s, /userType !== "lawyer"/);
  assert.match(s, /ignoreDuplicates: true/);
  assert.doesNotMatch(s, /verification_status/);
  assert.match(code("app/dashboard/lawyer/profile/edit/page.tsx"), /\/api\/v1\/lawyer\/profile-row/);
});

test("CODE-F05 / CODE-F41: the marketplace shows no records, fees or budget input", () => {
  const s = code("components/marketplace/MyMarketplaceDashboard.tsx");
  assert.match(s, /DashboardComingSoon/);
  assert.doesNotMatch(s, /Number\(newBudget\)|newBudget/);
  assert.doesNotMatch(s, /عمولة|commission|15%|10%|7%|٪/i);
  assert.doesNotMatch(s, /useState\(/, "no local state can fake a success or a conflict check");
});

test("LIVE-F07: no readiness badges or fixed sample data in production on the sector homes", () => {
  for (const f of [
    "components/dashboard/sector/SectorProfileReadinessPanel.tsx",
    "components/dashboard/firm/FirmProfileReadinessPanel.tsx",
    "components/dashboard/sector/UnfinishedModulesPanel.tsx",
  ]) {
    const s = code(f);
    assert.doesNotMatch(s, /Backend-ready|Beta local|جاهزية|useAdminSettings/, f);
  }
  const ngo = code("app/dashboard/ngo/page.tsx");
  assert.doesNotMatch(ngo, /متوافق مع المركز الوطني|لوحة التحكم الشاملة/);
  assert.match(ngo, /isDemoMode \? COMPLIANCE_LOG : \[\]/);
  assert.match(ngo, /isDemoMode \? RECENT_DONATIONS : \[\]/);
  const micro = code("app/dashboard/micro/page.tsx");
  assert.doesNotMatch(micro, /دائماً في أمان/);
  assert.match(micro, /isDemoMode \? REQUIREMENTS_MOCK : \[\]/);
  assert.doesNotMatch(code("app/dashboard/firm/page.tsx"), /تحديث فوري/);
  assert.match(code("app/dashboard/ngo/compliance/page.tsx"), /isDemoMode \?/);
  const volunteers = code("app/dashboard/ngo/volunteers/page.tsx");
  assert.doesNotMatch(volunteers, /ريم الحربي|عبدالعزيز الدوسري|نورة القحطاني/);
});

test("LIVE-F07: every unfinished module's own page says so (banner or «قريباً» gate)", async () => {
  const { SECTOR_UNFINISHED } = await import("../../constants/sectorUnfinishedModules.ts");
  let pages = 0;
  for (const copy of Object.values(SECTOR_UNFINISHED)) {
    for (const mod of copy.modules) {
      for (const href of mod.hrefs) {
        const s = code(`app${href}/page.tsx`);
        const gated = /DashboardComingSoon|MyMarketplaceDashboard/.test(s);
        const banner = s.includes(`<UnfinishedModuleNote href="${href}" />`);
        assert.ok(gated || banner, `${href} (${mod.name}) shows neither the banner nor the «قريباً» gate`);
        pages += 1;
      }
    }
  }
  assert.ok(pages >= 30, `expected the full list of module pages, got ${pages}`);
});
