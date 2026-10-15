import assert from "node:assert/strict";
import test from "node:test";
import { CLIENT_SERVICE_CATALOG } from "./clientServiceCatalog.ts";

// Owner Q42: «طلب عام» is available to clients, from an estimated ٥٠٠ ر.س.

const general = CLIENT_SERVICE_CATALOG.find((s) => s.serviceId === "general");

test("Q42: «طلب عام» is client-visible", () => {
  assert.ok(general, "the general request is missing from the catalogue");
  assert.equal(general!.betaVisibility, "public");
  assert.notEqual(general!.enabled, false);
  // The same filter getVisibleClientServiceCatalog (pricingRepository.ts)
  // applies for clients outside the beta.
  const visible = CLIENT_SERVICE_CATALOG.filter((s) => s.betaVisibility === "public" && s.enabled !== false);
  assert.ok(visible.some((s) => s.serviceId === "general"));
});

test("Q42: «طلب عام» is priced from ٥٠٠ ر.س and labelled as an estimate", () => {
  assert.equal(general!.basePrice, 500);
  assert.equal(general!.priceMode, "starting_from"); // rendered «يبدأ من ٥٠٠ ر.س»
  assert.match(general!.priceNote ?? "", /سعر تقديري/);
});
