/**
 * Owner ١٢٢ / ١٤٦ (register 14 #19, batch l12): the legal opinion is for
 * lawyers and law firms only; the consultant loses it and contract drafting,
 * except a consultant whose paid term was already running at the cut-off, to
 * that term's end. The rule is one function (toolRoleRefusal) fed by one read
 * (consultantTerm.ts), used by the run path and tool-status alike.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/consultantTerm.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { consultantPaidTermCovers, CONSULTANT_TOOLS_CUTOFF } from "./consultantTerm.ts";
import { toolRoleRefusal } from "./aiToolsConfig.ts";
import { AI_TOOLS, LAWYER_FIRM_ROLES } from "./tools.ts";
import { lawyerOnlyAiTool } from "./lawyerOnlyTools.ts";
import { CONSULTANT_RESERVED_MESSAGE } from "../auth/practiceKind.ts";

const src = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

const NOW = Date.parse("2026-12-15T00:00:00Z");
const paid = (start: string, end: string | null, extra: Record<string, unknown> = {}) => ({
  tier: "pro", status: "active", current_period_start: start, current_period_end: end, ...extra,
});

test("Q122: both legal-opinion tools are lawyer + firm only; /ai/legal-opinion is a lawyer-only page", () => {
  for (const id of ["legal-opinion-consult", "legal-opinion-letter"]) {
    assert.equal(AI_TOOLS[id].roles, LAWYER_FIRM_ROLES, id);
    for (const other of ["individual", "corporate", "micro", "provider", "government", "ngo"]) {
      assert.equal(toolRoleRefusal(AI_TOOLS[id], { userType: other, practiceKind: null }), "role", `${id} ${other}`);
    }
    assert.equal(toolRoleRefusal(AI_TOOLS[id], { userType: "admin", practiceKind: null }), null);
  }
  assert.equal(lawyerOnlyAiTool("/ai/legal-opinion"), "legal-opinion-consult");
  assert.equal(lawyerOnlyAiTool("/ai/legal-opinion?type=letter"), "legal-opinion-consult");
});

test("Q146: the consultant is off the legal opinion and contracts-pro; contract review stays open", () => {
  for (const id of ["legal-opinion-consult", "legal-opinion-letter", "contracts-pro"]) {
    assert.equal(AI_TOOLS[id].consultantBlocked, true, id);
    assert.equal(AI_TOOLS[id].consultantPaidTerm, true, id);
    assert.equal(toolRoleRefusal(AI_TOOLS[id], { userType: "lawyer", practiceKind: "consultant" }), "consultant_blocked", id);
    assert.equal(toolRoleRefusal(AI_TOOLS[id], { userType: "lawyer", practiceKind: "advocate" }), null, id);
    assert.equal(toolRoleRefusal(AI_TOOLS[id], { userType: "firm", practiceKind: "advocate" }), null, id);
  }
  assert.equal(AI_TOOLS["contract-review"].consultantBlocked, false);
});

test("Q146: a paid term keeps the reserved tools; it never opens an Art. 18 pleading tool", () => {
  const caller = { userType: "lawyer", practiceKind: "consultant", consultantPaidTerm: true };
  for (const id of ["legal-opinion-consult", "legal-opinion-letter", "contracts-pro"]) {
    assert.equal(toolRoleRefusal(AI_TOOLS[id], caller), null, id);
  }
  for (const id of ["legal-drafter", "wargaming", "brief-check", "analyze-strength", "najiz-optimizer"]) {
    assert.equal(toolRoleRefusal(AI_TOOLS[id], caller), "consultant_blocked", id);
  }
  // Only a literal true counts.
  assert.equal(
    toolRoleRefusal(AI_TOOLS["contracts-pro"], { userType: "lawyer", practiceKind: "consultant", consultantPaidTerm: "yes" as unknown as boolean }),
    "consultant_blocked",
  );
});

test("the paid term: active, not free, started before the cut-off, not ended", () => {
  assert.equal(CONSULTANT_TOOLS_CUTOFF, "2026-11-22T00:00:00+03:00");
  assert.equal(consultantPaidTermCovers([paid("2026-11-01T00:00:00Z", "2026-12-31T00:00:00Z")], NOW), true);
  // Ended already.
  assert.equal(consultantPaidTermCovers([paid("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z")], NOW), false);
  // A term that started after the cut-off (a new purchase, or a renewal) opens nothing.
  assert.equal(consultantPaidTermCovers([paid("2026-11-25T00:00:00Z", "2027-11-25T00:00:00Z")], NOW), false);
  // Free tier, an inactive row, an open-ended row, a broken date.
  assert.equal(consultantPaidTermCovers([paid("2026-11-01T00:00:00Z", "2026-12-31T00:00:00Z", { tier: "free" })], NOW), false);
  assert.equal(consultantPaidTermCovers([paid("2026-11-01T00:00:00Z", "2026-12-31T00:00:00Z", { status: "cancelled" })], NOW), false);
  assert.equal(consultantPaidTermCovers([paid("2026-11-01T00:00:00Z", null)], NOW), false);
  assert.equal(consultantPaidTermCovers([paid("not a date", "2026-12-31T00:00:00Z")], NOW), false);
  assert.equal(consultantPaidTermCovers([], NOW), false);
});

test("one read for both paths, and the refusal names the reservation, not Art. 18", () => {
  assert.match(src("app/api/v1/ai/runs/route.ts"), /practice === "consultant" \? \{ consultantPaidTerm: await readConsultantPaidTerm\(admin, user\.id\) \}/);
  assert.match(src("lib/ai/toolStatus.ts"), /await readConsultantPaidTerm\(admin, userId\)/);
  assert.match(src("lib/ai/runCore.ts"), /spec\.consultantPaidTerm === true \? CONSULTANT_RESERVED_MESSAGE : CONSULTANT_BLOCKED_MESSAGE/);
  assert.doesNotMatch(CONSULTANT_RESERVED_MESSAGE, /المادة ١٨|يترافع/);
});

test("Q122: no non-lawyer surface links the legal opinion any more", () => {
  assert.doesNotMatch(src("components/ai/LawyerOnlyToolNotice.tsx"), /\/ai\/legal-opinion/);
  assert.match(src("components/ai/LawyerOnlyToolNotice.tsx"), /اطلب من محامٍ/);
  for (const rel of ["app/ai/micro/page.tsx", "app/dashboard/client/page.tsx", "app/dashboard/micro/page.tsx", "components/OnboardingBanner.tsx"]) {
    assert.doesNotMatch(src(rel), /href: "\/ai\/legal-opinion"/, rel);
  }
});
