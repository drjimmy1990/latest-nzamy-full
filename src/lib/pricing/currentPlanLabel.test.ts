import assert from "node:assert/strict";
import test from "node:test";
import { PAYABLE_ITEMS, buyerAllowed } from "../payments/catalog.ts";
import { TIER_LABELS_AR } from "../../hooks/featureAccess.ts";
import { currentPlanLabelAr } from "./currentPlanLabel.ts";

// [userType, practiceKind, tier, the catalog item the account's family sells]
const SOLD = [
  ["firm",       "advocate",   "corp",       "firm-basic"],
  ["firm",       "advocate",   "enterprise", "firm-enterprise"],
  ["individual", "advocate",   "ai",         "ind-ai"],
  ["individual", "advocate",   "pro",        "ind-preventive"],
  ["individual", "advocate",   "max",        "ind-litigation"],
  ["lawyer",     "advocate",   "pro",        "lawyer-pro"],
  ["lawyer",     "consultant", "pro",        "consultant-independent"],
] as const;

test("«باقتك الحالية» names the plan the account's family sells (catalog labelAr)", () => {
  for (const [userType, practiceKind, tier, itemId] of SOLD) {
    const item = PAYABLE_ITEMS[itemId];
    const label = `${userType}/${practiceKind}/${tier}`;
    assert.equal(currentPlanLabelAr(userType, practiceKind, tier), item.labelAr, label);
    // The table can only point at an item that grants this tier to this buyer.
    assert.equal(item.tier, tier, `${label}: tier`);
    assert.ok(buyerAllowed(item, userType), `${label}: buyer`);
  }
  assert.equal(currentPlanLabelAr("firm", "advocate", "corp"), "مكتب المحاماة");
  assert.equal(currentPlanLabelAr("firm", "advocate", "enterprise"), "شركة المحاماة");
  assert.equal(currentPlanLabelAr("lawyer", "consultant", "pro"), "المستشار القانوني المستقل");
});

test("anything else falls back to the generic tier name", () => {
  const fallbacks = [
    ["firm", "advocate", "pro"],
    ["lawyer", "advocate", "max"],
    ["lawyer", "consultant", "ai"],
    ["provider", "advocate", "pro"],
    ["corporate", "advocate", "corp"],
    ["individual", "advocate", "shield"],
    ["individual", "advocate", "free"],
    [null, "advocate", "pro"],
    ["admin", "advocate", "enterprise"],
  ] as const;
  for (const [userType, practiceKind, tier] of fallbacks) {
    assert.equal(currentPlanLabelAr(userType, practiceKind, tier), TIER_LABELS_AR[tier], `${userType}/${practiceKind}/${tier}`);
  }
  // A consultant flag only matters on a lawyer account.
  assert.equal(currentPlanLabelAr("individual", "consultant", "pro"), PAYABLE_ITEMS["ind-preventive"].labelAr);
});
