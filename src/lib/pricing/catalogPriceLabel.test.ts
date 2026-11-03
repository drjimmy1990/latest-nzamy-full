import assert from "node:assert/strict";
import test from "node:test";
import { CLIENT_SERVICE_CATALOG } from "../../constants/clientServiceCatalog.ts";
import { mergeAdminPricingCatalogRows } from "../pricingRepository.ts";
import { catalogPriceLabel, dualAudiencePriceLabel } from "./catalogPriceLabel.ts";

test("S6: public pages state both contract-review prices", () => {
  assert.equal(
    dualAudiencePriceLabel("contract-review", CLIENT_SERVICE_CATALOG, "ar"),
    "يبدأ من ٦٠٠ ر.س للأفراد · يبدأ من ٨٠٠ ر.س للأعمال",
  );
  assert.equal(
    dualAudiencePriceLabel("contract-review", CLIENT_SERVICE_CATALOG, "en"),
    "From 600 SAR (individuals) · From 800 SAR (business)",
  );
  assert.equal(dualAudiencePriceLabel("video-short", CLIENT_SERVICE_CATALOG, "ar"), "٥٠٠ ر.س");
  assert.equal(dualAudiencePriceLabel("video-short", CLIENT_SERVICE_CATALOG, "en"), "500 SAR");
});

test("S6: one price when the business variant equals the individual price, is disabled, or the id is unknown", () => {
  const row = (base_price: string, enabled = true) =>
    mergeAdminPricingCatalogRows([
      {
        service_id: "contract-review-business",
        audience: "corporate",
        category_id: "contracts",
        label_ar: "مراجعة من محام متخصص",
        base_price,
        price_mode: "starting_from",
        receiver_type: "lawyer",
        beta_visibility: "public",
        requires_payment: true,
        enabled,
        metadata: { variantOf: "contract-review" },
      },
    ]);
  assert.equal(dualAudiencePriceLabel("contract-review", row("600"), "ar"), "يبدأ من ٦٠٠ ر.س");
  assert.equal(dualAudiencePriceLabel("contract-review", row("800", false), "ar"), "يبدأ من ٦٠٠ ر.س");
  assert.equal(dualAudiencePriceLabel("contract-review", row("900"), "ar"), "يبدأ من ٦٠٠ ر.س للأفراد · يبدأ من ٩٠٠ ر.س للأعمال");
  assert.equal(dualAudiencePriceLabel("notary", CLIENT_SERVICE_CATALOG, "ar"), null);
  // The variant id itself is never a priced service.
  assert.equal(catalogPriceLabel("contract-review-business", CLIENT_SERVICE_CATALOG, "ar"), null);
});
