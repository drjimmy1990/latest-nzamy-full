import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Fix round 1 (M4): while the session resolves, the audience reads
// "individual" for everyone — the screens S6 prices per audience hold the
// price (PRICE_PENDING_AR) instead of flashing 600 to a company.
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("M4: the hook exposes audienceLoading from the session", () => {
  const hook = src("hooks/useClientPricingCatalog.ts");
  assert.match(hook, /export const PRICE_PENDING_AR = "…";/);
  assert.match(hook, /return \{ catalog, source, loading, audience, audienceLoading: user\.loading \};/);
});

test("M4: every screen that shows an audience price holds it while the session resolves", () => {
  const screens: Array<[string, RegExp]> = [
    ["app/dashboard/client/requests/new/page.tsx", /audienceLoading \? PRICE_PENDING_AR : formatClientServicePrice\(serviceInfo\)/],
    ["app/dashboard/client/services/page.tsx", /audienceLoading \? PRICE_PENDING_AR : formatClientServicePrice\(service\)/],
    ["app/ai/contract-drafter/_components/StepLawyerCTA.tsx", /audienceLoading \? PRICE_PENDING_AR : REVIEW\.priceLabel/],
    ["components/floating/wa-steps/StepPayment.tsx", /audienceLoading \? PRICE_PENDING_AR : priced\.text/],
  ];
  for (const [file, re] of screens) assert.match(src(file), re, file);
  const consult = src("components/floating/wa-steps/StepConsult.tsx");
  assert.match(consult, /audienceLoading \? PRICE_PENDING_AR : aiPrice\.text/);
  assert.match(consult, /audienceLoading \? PRICE_PENDING_AR : lawyerPrice\.text/);
});
