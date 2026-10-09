/**
 * tests/pricing-plans.test.mjs
 * ─────────────────────────────────────────────────────────────
 * Automated validation test for Pricing Pyramid & Standalone Library Plans
 * (Owner & Council Decisions 165 & 168)
 * ─────────────────────────────────────────────────────────────
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

test("Pricing Plans and Decisions 165/168 Integrity Test", async (t) => {
  const plansPath = path.resolve(projectRoot, "src/lib/pricing/plans.ts");
  const libraryPricingPath = path.resolve(projectRoot, "src/constants/pricing/pricing.library.ts");
  const individualsPricingPath = path.resolve(projectRoot, "src/constants/pricing/pricing.individuals.ts");
  const paywallModalPath = path.resolve(projectRoot, "src/app/laws/components/PaywallModal.tsx");
  const subscribePagePath = path.resolve(projectRoot, "src/app/laws/subscribe/page.tsx");

  await t.test("All pricing source files exist", () => {
    assert.ok(fs.existsSync(plansPath), "plans.ts must exist");
    assert.ok(fs.existsSync(libraryPricingPath), "pricing.library.ts must exist");
    assert.ok(fs.existsSync(individualsPricingPath), "pricing.individuals.ts must exist");
    assert.ok(fs.existsSync(paywallModalPath), "PaywallModal.tsx must exist");
    assert.ok(fs.existsSync(subscribePagePath), "laws/subscribe/page.tsx must exist");
  });

  await t.test("Standalone Legal Library: Canonical 5,000 SAR / yr and 1,500 SAR / quarter", () => {
    const plansContent = fs.readFileSync(plansPath, "utf8");
    assert.match(plansContent, /priceMonthly:\s*5000/, "Annual library plan must be 5000 SAR");
    assert.match(plansContent, /priceMonthly:\s*1500/, "Quarterly library plan must be 1500 SAR");
    assert.match(plansContent, /priceYearly:\s*2500/, "AI Researcher Add-on must be 2500 SAR");

    // Check pricing.library.ts
    const libContent = fs.readFileSync(libraryPricingPath, "utf8");
    assert.match(libContent, /٥٬٠٠٠/, "Annual library in pricing.library.ts must show 5000 SAR in Arabic");
    assert.match(libContent, /١٬٥٠٠/, "Quarterly library in pricing.library.ts must show 1500 SAR in Arabic");
    assert.match(libContent, /"5,000"/, "Annual library in pricing.library.ts must show 5000 SAR in English");
    assert.match(libContent, /"1,500"/, "Quarterly library in pricing.library.ts must show 1500 SAR in English");

    // Check PaywallModal.tsx
    const paywallContent = fs.readFileSync(paywallModalPath, "utf8");
    assert.match(paywallContent, /"٥٬٠٠٠"/, "PaywallModal must display 5000 SAR in Arabic");
    assert.match(paywallContent, /"١٬٥٠٠"/, "PaywallModal must display 1500 SAR in Arabic");

    // Check subscribe page
    const subContent = fs.readFileSync(subscribePagePath, "utf8");
    assert.match(subContent, /٥٬٠٠٠ ﷼ \/ سنة/, "Subscribe page must show 5000 SAR annual in Arabic");
    assert.match(subContent, /١٬٥٠٠ ﷼ \/ ٣ أشهر/, "Subscribe page must show 1500 SAR quarterly in Arabic");
    assert.match(subContent, /SAR 5,000 \/ Year/, "Subscribe page must show 5000 SAR annual in English");
    assert.match(subContent, /SAR 1,500 \/ 3 Months/, "Subscribe page must show 1500 SAR quarterly in English");
  });

  await t.test("Individuals Pricing Pyramid: 39, 149, 399, 699 SAR", () => {
    const plansContent = fs.readFileSync(plansPath, "utf8");
    assert.match(plansContent, /"ind-ai"[\s\S]*?priceMonthly:\s*39/, "AI plan must be 39 SAR/mo");
    assert.match(plansContent, /"ind-preventive"[\s\S]*?priceMonthly:\s*149/, "Preventive plan must be 149 SAR/mo");
    assert.match(plansContent, /"ind-litigation"[\s\S]*?priceMonthly:\s*399/, "Litigation plan must be 399 SAR/mo");
    assert.match(plansContent, /"ind-family"[\s\S]*?priceMonthly:\s*699/, "Family plan must be 699 SAR/mo");

    // Check pricing.individuals.ts
    const indContent = fs.readFileSync(individualsPricingPath, "utf8");
    assert.match(indContent, /id:\s*"ind-ai"[\s\S]*?priceMonthly:\s*"٣٩"/, "pricing.individuals.ts must have 39 SAR AI plan");
    assert.match(indContent, /id:\s*"ind-preventive"[\s\S]*?priceMonthly:\s*"١٤٩"/, "pricing.individuals.ts must have 149 SAR preventive plan");
    assert.match(indContent, /id:\s*"ind-litigation"[\s\S]*?priceMonthly:\s*"٣٩٩"/, "pricing.individuals.ts must have 399 SAR litigation plan");
    assert.match(indContent, /id:\s*"ind-family"[\s\S]*?priceMonthly:\s*"٦٩٩"/, "pricing.individuals.ts must have 699 SAR family plan");
  });

  await t.test("Underwriting Rules for Litigation Tier", () => {
    const plansContent = fs.readFileSync(plansPath, "utf8");
    assert.match(plansContent, /"ind-litigation"[\s\S]*?requiresUnderwriting:\s*true/, "Litigation plan must require underwriting");
    
    const indContent = fs.readFileSync(individualsPricingPath, "utf8");
    assert.match(indContent, /تخضع لقواعد الاكتتاب والقبول/, "Litigation badge must emphasize underwriting rules in Arabic");
  });

  await t.test("Independent Legal Consultant: 199 SAR / mo and Article 18 Gated", () => {
    const plansContent = fs.readFileSync(plansPath, "utf8");
    assert.match(plansContent, /"consultant-independent"[\s\S]*?priceMonthly:\s*199/, "Consultant plan must be 199 SAR/mo");
    assert.match(plansContent, /article18Restricted:\s*true/, "Consultant plan must be restricted per Article 18");
    assert.match(plansContent, /المادة ١٨/, "Consultant plan must reference Article 18");

    const provPath = path.resolve(projectRoot, "src/constants/pricing/pricing.providers.ts");
    const provContent = fs.readFileSync(provPath, "utf8");
    assert.match(provContent, /"consultant-independent"/, "pricing.providers.ts must include consultant-independent");
    assert.match(provContent, /priceMonthly:\s*"١٩٩"/, "pricing.providers.ts must have 199 SAR in Arabic");
    assert.match(provContent, /المادة ١٨/, "pricing.providers.ts must reference Article 18");
  });
});
