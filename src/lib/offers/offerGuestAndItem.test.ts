/**
 * offerGuestAndItem.test.ts — batch l11 (pay):
 *   - O9: /checkout shows only the offers of the item being bought and the
 *     general ones (planRef in the card DTO, offersForItem);
 *   - O17 (register 20): offers for a visitor who is not signed in (the
 *     `guest` audience key, GET /api/v1/offers answers him instead of a 401,
 *     the /pricing strip is enabled for him).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/offers/offerGuestAndItem.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_RETURN_MINUTES,
  GUEST_AUDIENCE,
  GUEST_NEEDS_ANY_AR,
  GUEST_VIEWER,
  OFFER_AUDIENCE_KEYS,
  OFFER_AUDIENCE_LABELS_AR,
  audienceKeyFor,
  offerCardDto,
  offerInputToColumns,
  offerMatchesViewer,
  offersForItem,
  offersFromApi,
  type OfferRow,
  type OfferViewer,
} from "./offerRules.ts";

const SRC = join(import.meta.dirname, "..", "..");
const ROOT = join(SRC, "..");
const read = (...p: string[]) => readFileSync(join(SRC, ...p), "utf8");

function row(over: Partial<OfferRow> = {}): OfferRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    slug: null,
    title: "عرض",
    body: "نص",
    media_url: null,
    media_kind: null,
    cta_label: "اطلب",
    cta_href: "/pricing",
    audience_account_types: ["individual"],
    audience_verification: "any",
    exclude_buyers: true,
    plan_ref: null,
    campaign_id: null,
    starts_at: null,
    ends_at: null,
    seats_total: null,
    seats_used: 0,
    priority: 0,
    status: "active",
    dismiss_return_minutes: DEFAULT_RETURN_MINUTES,
    created_at: "2026-11-19T00:00:00Z",
    updated_at: "2026-11-19T00:00:00Z",
    ...over,
  };
}

const OPEN = { open: true as const, seatsLeft: null, seatsTotal: null, endsAt: null };

// ── O9: the offer of the item being bought ──────────────────────────────────

test("O9: the card carries its plan_ref, and the browser keeps only a price-book id", () => {
  assert.equal(offerCardDto(row({ plan_ref: "lib-annual" }), OPEN).planRef, "lib-annual");
  assert.equal(offerCardDto(row(), OPEN).planRef, null);
  const card = offerCardDto(row({ plan_ref: "lib-annual" }), OPEN);
  assert.equal(offersFromApi({ offers: [card], popupId: null, sessionKey: null })?.offers[0].planRef, "lib-annual");
  for (const bad of ["../x", "LIB", "", 7, null, undefined]) {
    assert.equal(offersFromApi({ offers: [{ ...card, planRef: bad }], popupId: null, sessionKey: null })?.offers[0].planRef, null, String(bad));
  }
});

test("O9: checkout shows that item's offers and the general ones — never another item's", () => {
  const offers = [
    { id: "general", planRef: null },
    { id: "library", planRef: "lib-annual" },
    { id: "founder", planRef: "lawyer-founder-2026" },
  ];
  assert.deepEqual(offersForItem(offers, "lib-annual").map((o) => o.id), ["general", "library"]);
  assert.deepEqual(offersForItem(offers, "topup-250").map((o) => o.id), ["general"]);
  assert.deepEqual(offersForItem(offers, "lawyer-founder-2026").map((o) => o.id), ["general", "founder"]);
  assert.deepEqual(offersForItem(offers, undefined).map((o) => o.id), ["general"]);
});

test("O9: /checkout passes the item to the offers strip", () => {
  const page = read("app", "checkout", "page.tsx");
  assert.ok(page.includes('<OffersList variant="checkout" itemId={parsed.itemId} />'));
  const list = read("components", "offers", "OffersList.tsx");
  assert.ok(list.includes("offersForItem(reply.offers, itemId)"));
});

// ── O17: offers for a visitor ───────────────────────────────────────────────

test("O17: «زائر» is an audience key no signed-in account ever maps to", () => {
  assert.ok((OFFER_AUDIENCE_KEYS as readonly string[]).includes("guest"));
  assert.equal(OFFER_AUDIENCE_LABELS_AR.guest, "زائر غير مسجّل");
  for (const t of ["lawyer", "firm", "individual", "corporate", "admin", "provider", null, "guest"]) {
    assert.notEqual(audienceKeyFor(t, null), GUEST_AUDIENCE, String(t));
  }
});

test("O17: a visitor sees a guest offer with verification «any», nothing else", () => {
  assert.equal(offerMatchesViewer(row({ audience_account_types: ["guest"] }), GUEST_VIEWER), true);
  assert.equal(offerMatchesViewer(row({ audience_account_types: ["guest", "individual"], plan_ref: "lib-annual" }), GUEST_VIEWER), true);
  assert.equal(offerMatchesViewer(row({ audience_account_types: ["individual"] }), GUEST_VIEWER), false);
  assert.equal(offerMatchesViewer(row({ audience_account_types: ["guest"], audience_verification: "verified" }), GUEST_VIEWER), false);
  assert.equal(offerMatchesViewer(row({ audience_account_types: ["guest"], audience_verification: "unverified" }), GUEST_VIEWER), false);
  // a signed-in individual does not get a guest-only offer
  const individual: OfferViewer = { audience: "individual", verified: true, boughtPlanRefs: new Set(), founderSeat: false };
  assert.equal(offerMatchesViewer(row({ audience_account_types: ["guest"] }), individual), false);
});

test("O17: the admin may tick «زائر» only with verification «الكل» — on create and on edit", () => {
  const plans = new Set(["lib-annual"]);
  const base = { title: "x", ctaLabel: "y", ctaHref: "/pricing" };
  assert.equal(offerInputToColumns({ ...base, audience: ["guest"] }, null, plans).ok, true);
  assert.deepEqual(offerInputToColumns({ ...base, audience: ["guest"], verification: "verified" }, null, plans), { ok: false, error: GUEST_NEEDS_ANY_AR });
  const stored = { campaign_id: null, starts_at: null, ends_at: null, audience_account_types: ["individual"], audience_verification: "verified" as const };
  assert.deepEqual(offerInputToColumns({ audience: ["guest", "individual"] }, stored, plans), { ok: false, error: GUEST_NEEDS_ANY_AR });
  assert.equal(offerInputToColumns({ audience: ["guest", "individual"], verification: "any" }, stored, plans).ok, true);
  const storedGuest = { ...stored, audience_account_types: ["guest"], audience_verification: "any" as const };
  assert.deepEqual(offerInputToColumns({ verification: "unverified" }, storedGuest, plans), { ok: false, error: GUEST_NEEDS_ANY_AR });
  assert.equal(offerInputToColumns({ ...base, audience: ["visitor"] }, null, plans).ok, false);
});

test("O17: the route answers a visitor with the guest offers; /pricing enables the strip for him", () => {
  const route = read("app", "api", "v1", "offers", "route.ts");
  assert.ok(route.includes("auth instanceof NextResponse && auth.status === 401"));
  assert.ok(route.includes("loadOffersForGuest("));
  const server = read("lib", "offers", "offersServer.ts");
  const guest = server.slice(server.indexOf("export async function loadOffersForGuest"));
  const body = guest.slice(0, guest.indexOf("\n}\n") > 0 ? guest.indexOf("\n}\n") : guest.indexOf("\r\n}\r\n"));
  assert.ok(body.includes('.contains("audience_account_types", [GUEST_VIEWER.audience])'));
  assert.ok(body.includes("popupId: null, sessionKey: null"), "never a popup for a visitor");
  for (const t of ["profiles", "lawyer_profiles", "offer_dismissals", "founder_seats"]) {
    assert.equal(body.includes(t), false, `a visitor's read touches no account table (${t})`);
  }
  const pricing = read("app", "pricing", "page.tsx");
  assert.ok(pricing.includes('<OffersList variant="strip" enabled={!userLoading} />'));
});

test("O17: 20261201_20 widens the CHECK to «guest» and pins guest offers to «any»", () => {
  const sql = readFileSync(join(ROOT, "supabase", "migrations", "20261201_20_pay_guest_offers_founder_renewal.sql"), "utf8");
  assert.match(sql, /'lawyer', 'consultant', 'firm', 'individual', 'corporate', 'guest'/);
  assert.match(sql, /offers_guest_verification_check/);
});
