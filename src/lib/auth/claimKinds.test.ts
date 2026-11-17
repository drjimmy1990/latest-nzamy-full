/**
 * claimKinds.test.ts — R9 (owner TODO 17 Nov 2026): a Google sign-up that
 * claims `lawyer` answers advocate / consultant, one that claims `firm`
 * answers law firm / licensed consulting office; never a default.
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/auth/claimKinds.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CLAIM_KIND_REFUSAL_AR,
  FIRM_KIND_OPTIONS_AR,
  PRACTICE_KIND_OPTIONS_AR,
  PRACTICE_KIND_QUESTION_AR,
  resolveClaimKinds,
} from "./claimKinds.ts";
import { firmKindMetadata } from "../../app/register/provider/signupMetadata.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../..");
const read = (rel: string) => readFileSync(join(src, rel), "utf8");
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("a lawyer claim must say advocate or consultant — no default", () => {
  assert.deepEqual(resolveClaimKinds("lawyer", "advocate", undefined), { ok: true, practiceKind: "advocate", firmKind: null });
  assert.deepEqual(resolveClaimKinds("lawyer", "consultant", null), { ok: true, practiceKind: "consultant", firmKind: null });
  assert.deepEqual(resolveClaimKinds("lawyer", undefined, undefined), { ok: false, reason: "practice_kind_missing" });
  assert.deepEqual(resolveClaimKinds("lawyer", null, undefined), { ok: false, reason: "practice_kind_missing" });
  for (const bad of ["", "Advocate", "notary", 1, {}, true]) {
    assert.deepEqual(resolveClaimKinds("lawyer", bad, undefined), { ok: false, reason: "kind_invalid" }, String(bad));
  }
  assert.deepEqual(resolveClaimKinds("lawyer", "advocate", "law_firm"), { ok: false, reason: "kind_invalid" });
});

test("a firm claim must say law firm or licensed consulting office", () => {
  assert.deepEqual(resolveClaimKinds("firm", undefined, "consulting_office"), { ok: true, practiceKind: null, firmKind: "consulting_office" });
  assert.deepEqual(resolveClaimKinds("firm", undefined, "law_firm"), { ok: true, practiceKind: null, firmKind: "law_firm" });
  assert.deepEqual(resolveClaimKinds("firm", undefined, undefined), { ok: false, reason: "firm_kind_missing" });
  assert.deepEqual(resolveClaimKinds("firm", undefined, "office"), { ok: false, reason: "kind_invalid" });
  assert.deepEqual(resolveClaimKinds("firm", "consultant", "law_firm"), { ok: false, reason: "kind_invalid" });
});

test("every other type takes no kind, and refuses one sent", () => {
  for (const t of ["individual", "corporate", "micro", "provider", "government", "ngo"]) {
    assert.deepEqual(resolveClaimKinds(t, undefined, undefined), { ok: true, practiceKind: null, firmKind: null }, t);
    assert.deepEqual(resolveClaimKinds(t, "advocate", undefined), { ok: false, reason: "kind_invalid" }, t);
    assert.deepEqual(resolveClaimKinds(t, undefined, "law_firm"), { ok: false, reason: "kind_invalid" }, t);
  }
});

test("the owner's words", () => {
  assert.equal(PRACTICE_KIND_QUESTION_AR, "محامٍ مترافع أم مستشار قانوني؟");
  assert.equal(PRACTICE_KIND_OPTIONS_AR.consultant.label, "مستشار قانوني");
  assert.equal(FIRM_KIND_OPTIONS_AR.consulting_office.label, "مكتب استشارات مرخص (م١٨)");
  for (const m of Object.values(CLAIM_KIND_REFUSAL_AR)) assert.match(m, /[؀-ۿ]/);
});

test("the register form sends firm_kind only for a consulting office", () => {
  assert.deepEqual(firmKindMetadata("firm", "consulting_office"), { firm_kind: "consulting_office" });
  assert.deepEqual(firmKindMetadata("firm", "law_firm"), {});
  assert.deepEqual(firmKindMetadata("firm", undefined), {});
  assert.deepEqual(firmKindMetadata("lawyer", "consulting_office"), {});
  const page = code("app/register/provider/page.tsx");
  assert.ok(page.includes("...firmKindMetadata(providerType, formData.firmKind)"));
  const steps = read("app/register/provider/components/Steps.tsx");
  assert.ok(steps.includes('onChange("firmKind", k.id)') && steps.includes("مكتب استشارات مرخص (م١٨)"));
});

test("the claim route checks the kind before any privileged write, and writes it with the sector row", () => {
  const route = code("app/api/v1/onboarding/account-type/route.ts");
  const kindsAt = route.indexOf("resolveClaimKinds(decision.userType, rawPracticeKind, rawFirmKind)");
  const serviceAt = route.indexOf("await createServiceClient()");
  assert.ok(kindsAt > 0 && serviceAt > kindsAt, "kinds are resolved before the service client exists");
  assert.ok(route.includes("practice_kind_confirmed_at: new Date().toISOString()"));
  assert.ok(route.includes("provisionSectorRow(service, decision, user.id, kindColumns)"));
  // a retry rewrites the kind on the row an earlier attempt left behind
  assert.ok(route.includes(".update(kindColumns).eq(spec.ownerColumn, userId)"));
});

test("the onboarding wizard asks both questions and sends the answers with the claim", () => {
  const page = code("app/onboarding/page.tsx");
  assert.ok(page.includes('selected === "lawyer" && ('));
  assert.ok(page.includes('selected === "firm" && ('));
  assert.ok(page.includes('if (pickerId === "lawyer" && practiceKind === null) return false;'));
  assert.ok(page.includes('if (pickerId === "firm" && firmKind === null) return false;'));
  assert.ok(page.includes('...(pickerId === "lawyer" && practiceKind ? { practiceKind } : {})'));
  assert.ok(page.includes('...(pickerId === "firm" && firmKind ? { firmKind } : {})'));
});

test("a lawyer never asked is sent to /onboarding/practice-kind before the dashboard", () => {
  const layout = code("app/dashboard/lawyer/layout.tsx");
  assert.ok(layout.includes("<PracticeKindGate />"));
  const gate = code("components/dashboard/PracticeKindGate.tsx");
  assert.ok(gate.includes('"/api/v1/onboarding/practice-kind"') && gate.includes("router.replace(PRACTICE_KIND_PAGE)"));
  const api = code("app/api/v1/onboarding/practice-kind/route.ts");
  // once only, the session's own row, never an id from the body
  assert.ok(api.includes('.is("practice_kind_confirmed_at", null)'));
  assert.ok(api.includes('.eq("user_id", s.user.id)'));
  assert.ok(!/body\??\.(userId|user_id|id)\b/.test(api));
});
