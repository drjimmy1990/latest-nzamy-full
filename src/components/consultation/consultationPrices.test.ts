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
import { PRICE_AFTER_REVIEW, consultationServiceId, consultationTypePrice, withCatalogPrices } from "./consultationPrices.ts";
import type { TypeDef } from "./constants.ts";

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("each paid type reads its catalogue service (the wizard's and the chat's mapping)", () => {
  assert.equal(consultationServiceId("voice"), "video-full");
  assert.equal(consultationServiceId("video"), "video-full");
  assert.equal(consultationServiceId("in-person"), "in-person");
  assert.equal(consultationServiceId("ai"), null);
});

test("the shown price IS the catalogue's: 500 for a call, 700 in person; the AI type is set after review", () => {
  const video = getClientServiceById("video-full", CLIENT_SERVICE_CATALOG);
  const inPerson = getClientServiceById("in-person", CLIENT_SERVICE_CATALOG);
  assert.equal(consultationTypePrice("voice", CLIENT_SERVICE_CATALOG, "ar"), formatClientServicePrice(video));
  assert.equal(consultationTypePrice("video", CLIENT_SERVICE_CATALOG, "ar"), formatClientServicePrice(video));
  assert.equal(consultationTypePrice("in-person", CLIENT_SERVICE_CATALOG, "ar"), formatClientServicePrice(inPerson));
  assert.equal(consultationTypePrice("video", CLIENT_SERVICE_CATALOG, "ar"), "٥٠٠ ر.س");
  assert.equal(consultationTypePrice("in-person", CLIENT_SERVICE_CATALOG, "ar"), "٧٠٠ ر.س");
  assert.equal(consultationTypePrice("in-person", CLIENT_SERVICE_CATALOG, "en"), "700 SAR");
  assert.equal(consultationTypePrice("ai", CLIENT_SERVICE_CATALOG, "ar"), PRICE_AFTER_REVIEW.ar);
});

test("an admin's catalogue row wins (what /api/client-pricing merges), and a missing row shows no number", () => {
  const edited = CLIENT_SERVICE_CATALOG.map((s) => (s.serviceId === "video-full" ? { ...s, basePrice: 650 } : s));
  assert.equal(consultationTypePrice("voice", edited, "ar"), "٦٥٠ ر.س");
  const without = CLIENT_SERVICE_CATALOG.filter((s) => s.serviceId !== "in-person");
  assert.equal(consultationTypePrice("in-person", without, "ar"), PRICE_AFTER_REVIEW.ar, "never «طلب عام»'s price");
});

test("withCatalogPrices replaces every card's price and nothing else", () => {
  const cards = [{ id: "video", price: "٢٩٩ ر.س", label: "x" }, { id: "ai", price: "y", label: "z" }] as unknown as TypeDef[];
  const out = withCatalogPrices(cards, CLIENT_SERVICE_CATALOG, "ar");
  assert.deepEqual(out.map((c) => c.price), ["٥٠٠ ر.س", PRICE_AFTER_REVIEW.ar]);
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
