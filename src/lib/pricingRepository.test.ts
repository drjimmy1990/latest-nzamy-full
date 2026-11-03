import assert from "node:assert/strict";
import test from "node:test";
import { CLIENT_SERVICE_CATALOG } from "../constants/clientServiceCatalog.ts";
import {
  getClientServiceById,
  getClientServicesByCategory,
  getVisibleClientServiceCatalog,
  mergeAdminPricingCatalogRows,
  type AdminPricingCatalogRow,
} from "./pricingRepository.ts";
import { resolveClientService } from "./pricing/clientPricingAudience.ts";

const BUSINESS_NOTE = "سعر الأعمال؛ يُؤكَّد بعد الاطلاع على العقد";

function variantRow(overrides: Partial<AdminPricingCatalogRow>): AdminPricingCatalogRow {
  return {
    service_id: "contract-review-business",
    audience: "corporate",
    category_id: "contracts",
    label_ar: "مراجعة من محام متخصص",
    base_price: "800",
    price_mode: "starting_from",
    receiver_type: "lawyer",
    beta_visibility: "public",
    requires_payment: true,
    enabled: true,
    metadata: {
      route: "/dashboard/client/requests/new?type=contract-review",
      requestType: "service",
      priceNote: BUSINESS_NOTE,
      humanService: true,
      variantOf: "contract-review",
    },
    ...overrides,
  };
}

test("S6: the code catalogue's contract review is 600 for individuals and 800 for companies", () => {
  const ind = resolveClientService("contract-review", "individual", CLIENT_SERVICE_CATALOG);
  assert.equal(ind.basePrice, 600);
  assert.equal(ind.priceAudience, "individual");

  const corp = resolveClientService("contract-review", "corporate", CLIENT_SERVICE_CATALOG);
  assert.equal(corp.basePrice, 800);
  assert.equal(corp.priceAudience, "corporate");
  assert.equal(corp.serviceId, "contract-review", "the base id, never the variant's");
  assert.equal(corp.route, "/dashboard/client/requests/new?type=contract-review");
  assert.equal(corp.priceNote, BUSINESS_NOTE);
  assert.equal(corp.priceMode, "starting_from");
  assert.equal(corp.requiresPayment, true);
  assert.equal(corp.label, "مراجعة من محام متخصص");
  assert.equal(corp.requestType, "service");
  assert.equal(corp.variantOf, undefined, "the resolved item is the base item, not a variant");
});

test("S6: a DB variant row wins over the code variant", () => {
  const catalog = mergeAdminPricingCatalogRows([variantRow({ base_price: "850" })]);
  assert.equal(resolveClientService("contract-review", "corporate", catalog).basePrice, 850);
  assert.equal(resolveClientService("contract-review", "individual", catalog).basePrice, 600);
});

test("S6: a DB row keeps its audience and variantOf through the merge", () => {
  const merged = mergeAdminPricingCatalogRows([variantRow({})]);
  const v = merged.find((s) => s.serviceId === "contract-review-business");
  assert.equal(v?.audience, "corporate");
  assert.equal(v?.variantOf, "contract-review");
  // A row that drops variantOf from its metadata keeps the code's: it never
  // becomes a card by accident.
  const stripped = mergeAdminPricingCatalogRows([variantRow({ metadata: { priceNote: BUSINESS_NOTE } })]);
  assert.equal(stripped.find((s) => s.serviceId === "contract-review-business")?.variantOf, "contract-review");
});

test("S6: a variant is never a card", () => {
  assert.equal(getVisibleClientServiceCatalog().some((s) => s.variantOf), false);
  assert.equal(getVisibleClientServiceCatalog({ includeBeta: true }).some((s) => s.variantOf), false);
  assert.ok(!getClientServicesByCategory("contracts").map((s) => s.serviceId).includes("contract-review-business"));
  const merged = mergeAdminPricingCatalogRows([variantRow({})]);
  assert.ok(!getClientServicesByCategory("contracts", merged).map((s) => s.serviceId).includes("contract-review-business"));
  assert.equal(getClientServiceById("contract-review-business").serviceId, "general");
  assert.equal(getClientServiceById("contract-review-business", merged).serviceId, "general");
  assert.equal(getClientServiceById("contract-review-business", []).serviceId, "general");
});

test("S6: corporate falls back to the base price when no variant exists", () => {
  const r = resolveClientService("video-short", "corporate", CLIENT_SERVICE_CATALOG);
  assert.equal(r.basePrice, 500);
  assert.equal(r.priceAudience, "individual");
});

test("S6: a disabled variant falls back to the individual price", () => {
  const catalog = mergeAdminPricingCatalogRows([variantRow({ enabled: false })]);
  const r = resolveClientService("contract-review", "corporate", catalog);
  assert.equal(r.basePrice, 600);
  assert.equal(r.priceAudience, "individual");
});

test("S6: an unknown id resolves like getClientServiceById (the general fallback), for both audiences", () => {
  assert.equal(resolveClientService("xyz", "individual", CLIENT_SERVICE_CATALOG).serviceId, "general");
  assert.equal(resolveClientService("xyz", "corporate", CLIENT_SERVICE_CATALOG).serviceId, "general");
});

test("S6: the admin toggle contract — disabling flags adminHidden, enabling removes it, other keys kept", async () => {
  const { adminHiddenPatch } = await import("./pricingRepository.ts");
  const meta = { route: "/x", priceNote: "n" };
  assert.deepEqual(adminHiddenPatch(false, meta), { enabled: false, metadata: { route: "/x", priceNote: "n", adminHidden: true } });
  assert.deepEqual(adminHiddenPatch(true, { ...meta, adminHidden: true }), { enabled: true, metadata: meta });
  assert.deepEqual(adminHiddenPatch(false, null), { enabled: false, metadata: { adminHidden: true } });
  assert.deepEqual(adminHiddenPatch(true, undefined), { enabled: true, metadata: {} });
  assert.deepEqual(meta, { route: "/x", priceNote: "n" }, "the input is not mutated");
});
