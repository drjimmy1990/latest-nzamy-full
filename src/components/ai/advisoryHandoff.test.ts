import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAdvisoryHandoff } from "./advisoryHandoff.ts";

test("the human-review button lands on a real human service", () => {
  const opinion = resolveAdvisoryHandoff("written-opinion");
  assert.equal(opinion.serviceLabel, "رأي قانوني مكتوب");
  assert.ok(opinion.href.startsWith("/"), "must be an in-app route");
  assert.ok(opinion.priceLabel.length > 0);

  const review = resolveAdvisoryHandoff("contract-review");
  assert.equal(review.serviceLabel, "مراجعة من محام متخصص");
  assert.ok(review.href.includes("contract-review"));
});

test("an unknown service id still produces a usable link, never an empty href", () => {
  // getClientServiceById falls back to `general`. The button must degrade to
  // "ask the office for something" rather than to href="" — which renders as
  // a link to the current page and looks like the button is broken.
  const out = resolveAdvisoryHandoff("no-such-service-id");
  assert.ok(out.href.startsWith("/"));
  assert.ok(out.serviceLabel.length > 0);
});

test("P1: the handoff reads the catalogue it is given — an admin_pricing_catalog edit is never ignored", async () => {
  const { mergeAdminPricingCatalogRows } = await import("../../lib/pricingRepository.ts");
  const fromDb = mergeAdminPricingCatalogRows([
    {
      service_id: "written-opinion",
      category_id: "consultation",
      label_ar: "رأي قانوني مكتوب (معدّل)",
      base_price: 900,
      price_mode: "fixed",
      receiver_type: "lawyer",
      beta_visibility: "public",
      requires_payment: true,
      enabled: true,
      metadata: { route: "/dashboard/client/consultation/new?type=written-opinion" },
    },
  ]);
  const out = resolveAdvisoryHandoff("written-opinion", fromDb);
  assert.equal(out.serviceLabel, "رأي قانوني مكتوب (معدّل)");
  assert.match(out.priceLabel, /٩٠٠/);
});

test("S6: a company's hand-off shows 800", async () => {
  const { CLIENT_SERVICE_CATALOG } = await import("../../constants/clientServiceCatalog.ts");
  assert.equal(resolveAdvisoryHandoff("contract-review", CLIENT_SERVICE_CATALOG, "corporate").priceLabel, "يبدأ من ٨٠٠ ر.س");
  assert.equal(resolveAdvisoryHandoff("contract-review").priceLabel, "يبدأ من ٦٠٠ ر.س");
  assert.equal(resolveAdvisoryHandoff("contract-review", CLIENT_SERVICE_CATALOG).priceLabel, "يبدأ من ٦٠٠ ر.س");
  // Same route either way: the base service's form.
  assert.equal(
    resolveAdvisoryHandoff("contract-review", CLIENT_SERVICE_CATALOG, "corporate").href,
    resolveAdvisoryHandoff("contract-review").href,
  );
});
