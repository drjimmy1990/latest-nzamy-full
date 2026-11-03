import assert from "node:assert/strict";
import test from "node:test";
import { CLIENT_SERVICE_CATALOG } from "../../constants/clientServiceCatalog.ts";
import { mergeAdminPricingCatalogRows } from "../pricingRepository.ts";
import { stampServiceEstimate } from "./serviceEstimate.ts";

test("S6: the stored estimate is the server's, per audience", () => {
  const corp = stampServiceEstimate(
    { service: "contract-review", originalPrice: 1, intake: { subject: "x" } },
    "corporate",
    CLIENT_SERVICE_CATALOG,
  ) as Record<string, unknown>;
  assert.deepEqual(
    { originalPrice: corp.originalPrice, priceMode: corp.priceMode, priceAudience: corp.priceAudience, quoteSource: corp.quoteSource },
    { originalPrice: 800, priceMode: "starting_from", priceAudience: "corporate", quoteSource: "server" },
  );
  assert.deepEqual(corp.intake, { subject: "x" });
  assert.equal(corp.service, "contract-review");

  const ind = stampServiceEstimate({ service: "contract-review", originalPrice: 1 }, "individual", CLIENT_SERVICE_CATALOG) as Record<string, unknown>;
  assert.equal(ind.originalPrice, 600);
  assert.equal(ind.priceAudience, "individual");

  assert.deepEqual(stampServiceEstimate({ service: "xyz", originalPrice: 5 }, "corporate", CLIENT_SERVICE_CATALOG), { service: "xyz", originalPrice: 5 });
  assert.deepEqual(stampServiceEstimate({ service: "contract-review" }, "corporate", CLIENT_SERVICE_CATALOG), { service: "contract-review" });
  assert.equal(stampServiceEstimate("text", "corporate", CLIENT_SERVICE_CATALOG), "text");
});

test("S6: the stamp never trusts the browser's price, mode or audience", () => {
  const forged = stampServiceEstimate(
    { service: "contract-review", originalPrice: 1, priceMode: "free", priceAudience: "corporate", quoteSource: "backend" },
    "individual",
    CLIENT_SERVICE_CATALOG,
  ) as Record<string, unknown>;
  assert.equal(forged.originalPrice, 600);
  assert.equal(forged.priceMode, "starting_from");
  assert.equal(forged.priceAudience, "individual");
  assert.equal(forged.quoteSource, "server");
});

test("S6: no stamp for a variant id, an array, null, a non-string service or a fallback", () => {
  const variant = { service: "contract-review-business", originalPrice: 9 };
  assert.deepEqual(stampServiceEstimate(variant, "corporate", CLIENT_SERVICE_CATALOG), variant);
  assert.deepEqual(stampServiceEstimate([1], "corporate", CLIENT_SERVICE_CATALOG), [1]);
  assert.equal(stampServiceEstimate(null, "corporate", CLIENT_SERVICE_CATALOG), null);
  assert.deepEqual(stampServiceEstimate({ service: 7, originalPrice: 9 }, "corporate", CLIENT_SERVICE_CATALOG), { service: 7, originalPrice: 9 });
  // The AI order keys are not catalogue ids (R19: no cross-namespace lookup).
  assert.deepEqual(stampServiceEstimate({ service: "contracts", originalPrice: 9 }, "corporate", CLIENT_SERVICE_CATALOG), { service: "contracts", originalPrice: 9 });
});

test("S6: a free / unpaid service stores 0; corporate without a variant gets the individuals' price", () => {
  const draft = stampServiceEstimate({ service: "contract-draft", originalPrice: 99 }, "individual", CLIENT_SERVICE_CATALOG) as Record<string, unknown>;
  assert.equal(draft.originalPrice, 0, "requiresPayment false → 0");
  const video = stampServiceEstimate({ service: "video-short", originalPrice: 1 }, "corporate", CLIENT_SERVICE_CATALOG) as Record<string, unknown>;
  assert.equal(video.originalPrice, 500);
  assert.equal(video.priceAudience, "individual", "the price's audience, not the requester's");
});

test("S6: an admin-edited DB variant prices the estimate", () => {
  const catalog = mergeAdminPricingCatalogRows([
    {
      service_id: "contract-review-business",
      audience: "corporate",
      category_id: "contracts",
      label_ar: "مراجعة من محام متخصص",
      base_price: "850",
      price_mode: "starting_from",
      receiver_type: "lawyer",
      beta_visibility: "public",
      requires_payment: true,
      enabled: true,
      metadata: { variantOf: "contract-review" },
    },
  ]);
  const out = stampServiceEstimate({ service: "contract-review", originalPrice: 800 }, "corporate", catalog) as Record<string, unknown>;
  assert.equal(out.originalPrice, 850);
});
