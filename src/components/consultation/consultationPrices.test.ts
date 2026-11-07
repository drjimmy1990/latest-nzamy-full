/**
 * consultationPrices.test.ts — Wave 1 task 6, item D: /book/consultation shows
 * the client service catalogue's price, and records the same string as the
 * request's estimate. It used to show 299 / 599 against a catalogue of
 * 500 / 700.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/components/consultation/consultationPrices.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { CLIENT_SERVICE_CATALOG } from "../../constants/clientServiceCatalog.ts";
import { formatClientServicePrice, getClientServiceById } from "../../lib/pricingRepository.ts";
import { PRICE_AFTER_REVIEW, consultationServiceId, consultationTypePrice, lawyerPriceRangeRows, withCatalogPrices } from "./consultationPrices.ts";
import { MODE_COPY } from "../../constants/clientConsultationData.ts";
import { getConsultationModeServiceId, mergeAdminPricingCatalogRows } from "../../lib/pricingRepository.ts";
import type { TypeDef } from "./constants.ts";

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("each paid type reads its own catalogue service (owner ٤٣٣: voice → voice-call, video → video-short)", () => {
  assert.equal(consultationServiceId("voice"), "voice-call");
  assert.equal(consultationServiceId("video"), "video-short");
  assert.equal(consultationServiceId("in-person"), "in-person");
  assert.equal(consultationServiceId("ai"), null);
  // the wizard's MODE_COPY names the same entries as the mapping
  for (const [mode, cfg] of Object.entries(MODE_COPY)) {
    assert.equal(cfg.serviceId, getConsultationModeServiceId(mode), mode);
  }
});

test("owner ٤٣٣: the default prices — written 79, voice 20 min 129, video 30 min 199, in person 45 min 349", () => {
  const want: Record<string, [number, string, { min: number; max: number }]> = {
    "written-opinion": [79, "", { min: 49, max: 199 }],
    "voice-call": [129, "20", { min: 89, max: 249 }],
    "video-short": [199, "30", { min: 149, max: 399 }],
    "in-person": [349, "45", { min: 249, max: 750 }],
  };
  for (const [id, [price, minutes, band]] of Object.entries(want)) {
    const e = CLIENT_SERVICE_CATALOG.find((s) => s.serviceId === id)!;
    assert.ok(e, id);
    assert.equal(e.basePrice, price, id);
    assert.equal(e.priceMode, "fixed", id);
    assert.notEqual(e.enabled, false, `${id} is offered`);
    assert.deepEqual(e.lawyerPriceRange, band, id);
    if (minutes) assert.ok(e.label.includes(`(${minutes} دقيقة)`) && (e.priceNote ?? "").includes(`${minutes} دقيقة`), `${id}: ${minutes} minutes`);
  }
  // the 60-minute session is retired: never a card, still resolvable for an old row
  const full = CLIENT_SERVICE_CATALOG.find((s) => s.serviceId === "video-full")!;
  assert.equal(full.enabled, false);
  assert.equal(getClientServiceById("video-full", CLIENT_SERVICE_CATALOG).serviceId, "video-full");
  // no consultation entry still says 500
  for (const s of CLIENT_SERVICE_CATALOG.filter((x) => x.categoryId === "consultation" && x.enabled !== false)) {
    assert.notEqual(s.basePrice, 500, s.serviceId);
  }
});

test("the shown price IS the catalogue's; the AI type is set after review", () => {
  const voice = getClientServiceById("voice-call", CLIENT_SERVICE_CATALOG);
  const video = getClientServiceById("video-short", CLIENT_SERVICE_CATALOG);
  const inPerson = getClientServiceById("in-person", CLIENT_SERVICE_CATALOG);
  assert.equal(consultationTypePrice("voice", CLIENT_SERVICE_CATALOG, "ar"), formatClientServicePrice(voice));
  assert.equal(consultationTypePrice("video", CLIENT_SERVICE_CATALOG, "ar"), formatClientServicePrice(video));
  assert.equal(consultationTypePrice("in-person", CLIENT_SERVICE_CATALOG, "ar"), formatClientServicePrice(inPerson));
  assert.equal(consultationTypePrice("voice", CLIENT_SERVICE_CATALOG, "ar"), "١٢٩ ر.س");
  assert.equal(consultationTypePrice("video", CLIENT_SERVICE_CATALOG, "ar"), "١٩٩ ر.س");
  assert.equal(consultationTypePrice("in-person", CLIENT_SERVICE_CATALOG, "ar"), "٣٤٩ ر.س");
  assert.equal(consultationTypePrice("in-person", CLIENT_SERVICE_CATALOG, "en"), "349 SAR");
  assert.equal(consultationTypePrice("ai", CLIENT_SERVICE_CATALOG, "ar"), PRICE_AFTER_REVIEW.ar);
});

test("owner ٤٣٣ deploy order: before 20261107_50 runs, the old DB rows still win and voice-call comes from code", () => {
  // the 20260518 seed rows as the DB holds them before the SQL
  const seedRow = (service_id: string, base_price: string, label_ar: string) => ({
    service_id, audience: "individual", category_id: "consultation" as const, label_ar, base_price,
    price_mode: "fixed" as const, receiver_type: "lawyer" as const, beta_visibility: "public" as const,
    requires_payment: true, enabled: true, metadata: {},
  });
  const before = mergeAdminPricingCatalogRows([
    seedRow("video-short", "500", "استشارة مرئية مختصرة (30 دقيقة)"),
    seedRow("in-person", "700", "استشارة حضورية (60 دقيقة)"),
  ]);
  assert.equal(consultationTypePrice("voice", before, "ar"), "١٢٩ ر.س", "no voice-call row: the code entry serves it");
  assert.equal(consultationTypePrice("video", before, "ar"), "٥٠٠ ر.س", "the DB row wins until the SQL runs");
  // after: the rows the SQL writes, ranges in metadata
  const after = mergeAdminPricingCatalogRows([
    { ...seedRow("voice-call", "129", "استشارة صوتية (20 دقيقة)"), metadata: { lawyerPriceRange: { min: 89, max: 249 } } },
    { ...seedRow("video-short", "199", "استشارة مرئية (30 دقيقة)"), metadata: { lawyerPriceRange: { min: 150, max: 400 } } },
    { ...seedRow("in-person", "349", "x"), metadata: { lawyerPriceRange: { min: 900, max: 100 } } },
  ]);
  assert.equal(consultationTypePrice("video", after, "ar"), "١٩٩ ر.س");
  assert.deepEqual(after.find((s) => s.serviceId === "video-short")!.lawyerPriceRange, { min: 150, max: 400 }, "a row's band wins");
  assert.deepEqual(after.find((s) => s.serviceId === "in-person")!.lawyerPriceRange, { min: 249, max: 750 }, "a malformed band keeps the code one");
});

test("owner ٤٣٣: the lawyer's panel lists each default price and band, marked «قريباً»; no client page shows the band", () => {
  const rows = lawyerPriceRangeRows(CLIENT_SERVICE_CATALOG, "ar");
  assert.deepEqual(rows.map((r) => [r.serviceId, r.defaultPrice, r.range]), [
    ["written-opinion", "٧٩ ر.س", "يحدد المحامي سعره بين ٤٩ و١٩٩ ر.س"],
    ["voice-call", "١٢٩ ر.س", "يحدد المحامي سعره بين ٨٩ و٢٤٩ ر.س"],
    ["video-short", "١٩٩ ر.س", "يحدد المحامي سعره بين ١٤٩ و٣٩٩ ر.س"],
    ["in-person", "٣٤٩ ر.س", "يحدد المحامي سعره بين ٢٤٩ و٧٥٠ ر.س"],
  ]);
  const edit = src("../../app/dashboard/lawyer/profile/edit/page.tsx");
  assert.match(edit, /lawyerPriceRangeRows\(pricingCatalog, "ar"\)/);
  assert.match(edit, /أسعار الاستشارات<\/p>\s*<span[^>]*>قريباً<\/span>/);
  for (const rel of ["../../app/services/consultations/page.tsx", "../../app/book/consultation/page.tsx", "../../app/dashboard/client/consultation/new/page.tsx", "../EscalationFlow.tsx"]) {
    assert.doesNotMatch(src(rel), /lawyerPriceRange|يحدد المحامي سعره/, rel);
  }
  // EscalationFlow reads the catalogue, never the old typed range
  const esc = src("../EscalationFlow.tsx");
  assert.doesNotMatch(esc, /٩٩ - ٢٤٩|99 - 249/);
  assert.match(esc, /consultationTypePrice\("voice", catalog, priceLang\)/);
  // /services/consultations names the catalogue durations, never 60 minutes
  const page = src("../../app/services/consultations/page.tsx");
  assert.doesNotMatch(page, /٦٠ دقيقة|60 min|٤٥ دقيقة كاملة|45 full minutes/);
  assert.ok(page.includes("صوتية ٢٠ دقيقة أو مرئية ٣٠ دقيقة") && page.includes("٤٥ دقيقة في مكتب المحامي"));
});

test("an admin's catalogue row wins (what /api/client-pricing merges), and a missing row shows no number", () => {
  const edited = CLIENT_SERVICE_CATALOG.map((s) => (s.serviceId === "voice-call" ? { ...s, basePrice: 650 } : s));
  assert.equal(consultationTypePrice("voice", edited, "ar"), "٦٥٠ ر.س");
  const without = CLIENT_SERVICE_CATALOG.filter((s) => s.serviceId !== "in-person");
  assert.equal(consultationTypePrice("in-person", without, "ar"), PRICE_AFTER_REVIEW.ar, "never «طلب عام»'s price");
});

test("withCatalogPrices replaces every card's price and nothing else", () => {
  const cards = [{ id: "video", price: "٢٩٩ ر.س", label: "x" }, { id: "ai", price: "y", label: "z" }] as unknown as TypeDef[];
  const out = withCatalogPrices(cards, CLIENT_SERVICE_CATALOG, "ar");
  assert.deepEqual(out.map((c) => c.price), ["١٩٩ ر.س", PRICE_AFTER_REVIEW.ar]);
  assert.equal(out[0].label, "x");
});

test("no booking type carries a typed price; the page shows and records the catalogue's", () => {
  const constants = src("./constants.ts").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(constants, /price: "[^"]*[0-9٠-٩]/, "a typed price is back in consultationTypes");
  assert.doesNotMatch(constants, /٢٩٩|٥٩٩|299 SAR|599 SAR/);
  const page = src("../../app/book/consultation/page.tsx");
  assert.match(page, /const \{ catalog \} = useClientPricingCatalog\(\);/);
  assert.match(page, /const typeList = withCatalogPrices\(/);
  // The estimate the request records is the same derivation as the screen.
  assert.match(page, /const arType = withCatalogPrices\(consultationTypes\.ar, catalog, "ar"\)/);
  assert.match(page, /estimatedPrice: arType\?\.price/);
});
