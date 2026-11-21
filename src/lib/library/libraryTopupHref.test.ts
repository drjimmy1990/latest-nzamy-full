/**
 * O16 (c), batch l11-misc: the 50-point lock banner's top-up link goes straight
 * to the 50-point pack's checkout while online payment is on for the viewer,
 * and to the price page (its request flow) otherwise.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LIBRARY_TOPUP_CHECKOUT_HREF, LIBRARY_TOPUP_HREF, libraryTopupHref } from "./pointsGate.ts";
import { parseCheckoutQuery } from "../payments/checkoutView.ts";
import { PRICE_BOOK } from "../pricing/priceBook.ts";
import { LIBRARY_ELIGIBLE_USER_TYPES } from "./libraryPurchaseEligibility.ts";

test("payment on → the 500-point checkout; off → the price page", () => {
  assert.equal(libraryTopupHref(true), LIBRARY_TOPUP_CHECKOUT_HREF);
  assert.equal(libraryTopupHref(false), LIBRARY_TOPUP_HREF);
  assert.equal(LIBRARY_TOPUP_HREF, "/pricing");
});

test("the checkout link is one /checkout accepts (item + billing)", () => {
  const url = new URL(LIBRARY_TOPUP_CHECKOUT_HREF, "https://example.invalid");
  assert.equal(url.pathname, "/checkout");
  const parsed = parseCheckoutQuery(url.searchParams.get("item") ?? undefined, url.searchParams.get("billing") ?? undefined);
  assert.deepEqual(parsed, { ok: true, itemId: "topup-500", billing: "once" });
});

test("l12 (Q87): the linked pack is on sale and sold to every library buyer type (never the retired 50 pack)", () => {
  const entry = PRICE_BOOK["topup-500"];
  assert.notEqual(entry.retired, true);
  const buyers = entry.buyers;
  assert.ok(Array.isArray(buyers));
  for (const t of LIBRARY_ELIGIBLE_USER_TYPES) assert.ok((buyers as readonly string[]).includes(t), t);
  assert.doesNotMatch(LIBRARY_TOPUP_CHECKOUT_HREF, /item=topup-50&/);
});

test("the banner picks the link from the viewer's payment status", () => {
  const src = readFileSync(new URL("../../components/library/LibraryPointsLockBanner.tsx", import.meta.url), "utf8");
  assert.match(src, /gatewayAllowsCheckout\(payments\) \? libraryTopupHref\(true\) : lock\.topupHref/);
  assert.match(src, /href=\{topupHref\}/);
});
