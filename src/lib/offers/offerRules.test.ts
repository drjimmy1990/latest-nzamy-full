/**
 * offerRules.test.ts — the offers system (owner message 18 Nov, item 5;
 * test protocol section هـ). The pure rules executed, plus source pins on the
 * wiring the routes and components cannot be imported for.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/offers/offerRules.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_RETURN_MINUTES,
  FOUNDER_LOCKED_AR,
  OFFER_COLUMNS,
  audienceKeyFor,
  compareOffers,
  founderOfferCopyFromApi,
  founderOfferCopyFromRow,
  offerAvailability,
  offerCardDto,
  offerInputToColumns,
  offerMatchesViewer,
  offerSeatsLineAr,
  offersFromApi,
  pickPopup,
  popupAllowedOnPath,
  type CampaignState,
  type OfferRow,
  type OfferViewer,
} from "./offerRules.ts";
import { campaignFromApi, founderCampaignCopyFromOffer, FOUNDER_CAMPAIGN_COPY } from "../pricing/campaigns.ts";
import { founderNoticeView } from "../founder/founderNotice.ts";

const SRC = join(import.meta.dirname, "..", "..");
const ROOT = join(SRC, "..");
const read = (...p: string[]) => readFileSync(join(SRC, ...p), "utf8");

const NOW = Date.parse("2026-11-20T12:00:00+03:00");
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;

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

const FOUNDER = row({
  id: "00000000-0000-4000-8000-0000000000f0",
  slug: "founder-2026",
  title: "باقة المحامي المؤسس",
  cta_href: "/founder",
  audience_account_types: ["lawyer"],
  audience_verification: "verified",
  plan_ref: "lawyer-founder-2026",
  campaign_id: "founder-2026",
  priority: 100,
});

const viewer = (over: Partial<OfferViewer> = {}): OfferViewer => ({
  audience: "lawyer",
  verified: true,
  boughtPlanRefs: new Set(),
  founderSeat: false,
  ...over,
});

const LIVE: CampaignState = { state: "live", seatsLeft: 40, capacity: 100, endsAtExclusive: "2026-12-18T00:00:00+03:00" };

// ── audience (هـ1, هـ7, هـ8, هـ9, هـ12) ───────────────────────────────────────

test("the account type → audience key: the consultant is his own key, admins and providers none", () => {
  assert.equal(audienceKeyFor("lawyer", "advocate"), "lawyer");
  assert.equal(audienceKeyFor("lawyer", null), "lawyer");
  assert.equal(audienceKeyFor("lawyer", "consultant"), "consultant");
  assert.equal(audienceKeyFor("firm", null), "firm");
  assert.equal(audienceKeyFor("individual", null), "individual");
  assert.equal(audienceKeyFor("corporate", null), "corporate");
  for (const t of ["admin", "provider", "micro", "government", "ngo", null, undefined, 42]) assert.equal(audienceKeyFor(t, null), null);
});

test("the founder offer reaches a verified or pending advocate lawyer only — never a consultant, a rejected / unverified lawyer, an individual, a firm or a company", () => {
  assert.equal(offerMatchesViewer(FOUNDER, viewer()), true);
  assert.equal(offerMatchesViewer(FOUNDER, viewer({ audience: "consultant" })), false);
  assert.equal(offerMatchesViewer(FOUNDER, viewer({ verified: false })), false);
  // l9 row 24: a pending licence may pay for the seat (l7 decision 1), so he sees the popup
  assert.equal(offerMatchesViewer(FOUNDER, viewer({ verified: false, pendingVerification: true })), true);
  assert.equal(offerMatchesViewer(FOUNDER, viewer({ audience: "consultant", verified: false, pendingVerification: true })), false);
  assert.equal(offerMatchesViewer(FOUNDER, viewer({ verified: false, pendingVerification: true, founderSeat: true })), false, "a held seat is already bought");
  // only the founder offer widens: another verified-only offer stays verified-only
  assert.equal(offerMatchesViewer({ ...FOUNDER, campaign_id: null }, viewer({ verified: false, pendingVerification: true })), false);
  assert.equal(offerMatchesViewer(FOUNDER, viewer({ verified: null })), false, "an unreadable verification never shows a verified-only offer");
  for (const a of ["individual", "firm", "corporate"] as const) assert.equal(offerMatchesViewer(FOUNDER, viewer({ audience: a })), false, a);
  assert.equal(offerMatchesViewer(FOUNDER, viewer({ audience: null })), false);
});

test("a buyer is excluded: a paid order of the plan, or (founder) any active / pending seat", () => {
  assert.equal(offerMatchesViewer(FOUNDER, viewer({ boughtPlanRefs: new Set(["lawyer-founder-2026"]) })), false);
  assert.equal(offerMatchesViewer(FOUNDER, viewer({ founderSeat: true })), false);
  const other = row({ plan_ref: "lib-annual", audience_account_types: ["individual"] });
  assert.equal(offerMatchesViewer(other, viewer({ audience: "individual", boughtPlanRefs: new Set(["lib-annual"]) })), false);
  assert.equal(offerMatchesViewer({ ...other, exclude_buyers: false }, viewer({ audience: "individual", boughtPlanRefs: new Set(["lib-annual"]) })), true);
});

test("a second offer for individuals only reaches individuals (هـ12)", () => {
  const ind = row({ audience_account_types: ["individual"] });
  assert.equal(offerMatchesViewer(ind, viewer({ audience: "individual", verified: false })), true);
  for (const a of ["lawyer", "consultant", "firm", "corporate"] as const) assert.equal(offerMatchesViewer(ind, viewer({ audience: a })), false, a);
  const unverifiedOnly = row({ audience_account_types: ["individual"], audience_verification: "unverified" });
  assert.equal(offerMatchesViewer(unverifiedOnly, viewer({ audience: "individual", verified: true })), false);
  assert.equal(offerMatchesViewer(unverifiedOnly, viewer({ audience: "individual", verified: false })), true);
});

// ── open or not (هـ10, هـ11, هـ14, هـ16) ─────────────────────────────────────

test("status, the server-clock window and the end", () => {
  const p = { purchases: 0, campaign: null };
  assert.deepEqual(offerAvailability(row({ status: "draft" }), NOW, p), { open: false, reason: "draft", seatsLeft: null, seatsTotal: null });
  assert.equal(offerAvailability(row({ status: "paused" }), NOW, p).open, false, "a stopped offer disappears at once");
  assert.equal(offerAvailability(row({ starts_at: iso(NOW + MIN) }), NOW, p).open, false);
  assert.equal(offerAvailability(row({ ends_at: iso(NOW) }), NOW, p).open, false, "the end instant is already over");
  const open = offerAvailability(row({ starts_at: iso(NOW - MIN), ends_at: iso(NOW + MIN) }), NOW, p);
  assert.deepEqual(open, { open: true, seatsLeft: null, seatsTotal: null, endsAt: iso(NOW + MIN) });
});

test("own seats: total − (recorded + paid purchases); none left → sold out", () => {
  const r = row({ seats_total: 1 });
  assert.deepEqual(offerAvailability(r, NOW, { purchases: 0, campaign: null }), { open: true, seatsLeft: 1, seatsTotal: 1, endsAt: null });
  assert.deepEqual(offerAvailability(r, NOW, { purchases: 1, campaign: null }), { open: false, reason: "sold_out", seatsLeft: 0, seatsTotal: 1 });
  assert.equal(offerAvailability(row({ seats_total: 1, seats_used: 1 }), NOW, { purchases: 0, campaign: null }).open, false, "the admin's test: seats 1, used 1");
});

test("the founder offer reads the campaign: live with its counter; sold out, ended, paused, pre or unreadable → closed", () => {
  assert.deepEqual(offerAvailability(FOUNDER, NOW, { purchases: 0, campaign: LIVE }), {
    open: true,
    seatsLeft: 40,
    seatsTotal: 100,
    endsAt: new Date(Date.parse("2026-12-18T00:00:00+03:00")).toISOString(),
  });
  assert.equal(offerAvailability(FOUNDER, NOW, { purchases: 0, campaign: { ...LIVE, state: "sold_out", seatsLeft: 0 } }).open, false);
  assert.equal(offerAvailability(FOUNDER, NOW, { purchases: 0, campaign: { ...LIVE, state: "ended" } }).open, false);
  assert.equal(offerAvailability(FOUNDER, NOW, { purchases: 0, campaign: { ...LIVE, state: "paused" } }).open, false);
  assert.equal(offerAvailability(FOUNDER, NOW, { purchases: 0, campaign: { ...LIVE, state: "pre" } }).open, false);
  assert.equal(offerAvailability(FOUNDER, NOW, { purchases: 0, campaign: null }).open, false);
  // purchases never touch the founder counter (it is the campaign's)
  assert.equal(offerAvailability(FOUNDER, NOW, { purchases: 999, campaign: LIVE }).open, true);
  // the campaign's end on the server clock, whatever a browser says
  assert.equal(offerAvailability(FOUNDER, Date.parse("2026-12-18T00:00:00+03:00"), { purchases: 0, campaign: LIVE }).open, false);
});

// ── order and the popup (هـ3, هـ6, هـ13) ────────────────────────────────────

test("display order: highest priority first, then the older offer", () => {
  const a = row({ id: "a", priority: 5, created_at: "2026-11-02T00:00:00Z" });
  const b = row({ id: "b", priority: 100 });
  const c = row({ id: "c", priority: 5, created_at: "2026-11-01T00:00:00Z" });
  assert.deepEqual([a, b, c].sort(compareOffers).map((r) => r.id), ["b", "c", "a"]);
});

test("the popup: the highest-priority offer not closed within its return delay", () => {
  const top = row({ id: "top", priority: 100 });
  const second = row({ id: "second", priority: 1 });
  assert.equal(pickPopup([top, second], [], NOW)?.id, "top", "two offers at once: the popup is the higher one (هـ13)");
  const closedNow = [{ offer_id: "top", dismissed_at: iso(NOW - MIN) }];
  assert.equal(pickPopup([top, second], closedNow, NOW)?.id, "second");
  assert.equal(pickPopup([top], closedNow, NOW), null, "closed a minute ago: stays away for 3 days");
  assert.equal(pickPopup([top], [{ offer_id: "top", dismissed_at: iso(NOW - DEFAULT_RETURN_MINUTES * MIN) }], NOW)?.id, "top", "back after 3 days");
  const oneMinute = row({ id: "t", dismiss_return_minutes: 1 });
  assert.equal(pickPopup([oneMinute], [{ offer_id: "t", dismissed_at: iso(NOW - 30_000) }], NOW), null);
  assert.equal(pickPopup([oneMinute], [{ offer_id: "t", dismissed_at: iso(NOW - MIN) }], NOW)?.id, "t", "the admin's 1-minute test (هـ6)");
  assert.equal(DEFAULT_RETURN_MINUTES, 4320);
});

test("the popup never opens during signup, payment, the terms or in the admin console (هـ2)", () => {
  for (const p of ["/dashboard", "/dashboard/lawyer", "/dashboard/lawyer/cases", "/dashboard/client", "/dashboard/firm/team", "/dashboard/business"]) {
    assert.equal(popupAllowedOnPath(p), true, p);
  }
  for (const p of [
    "/register", "/register/provider", "/onboarding/practice-kind", "/checkout", "/payments/result", "/terms", "/founder-terms",
    "/refund-policy", "/login", "/pricing", "/founder", "/", null, undefined,
    "/dashboard/admin", "/dashboard/admin/offers", "/dashboard/billing", "/dashboard/billing/receipt/1",
    "/dashboard/client/wallet", "/dashboard/business/wallet", "/dashboard/firm/wallet", "/dashboard/offers",
    "/dashboardx",
  ]) {
    assert.equal(popupAllowedOnPath(p), false, String(p));
  }
});

// ── what the browser reads ─────────────────────────────────────────────────

test("offersFromApi keeps only same-site buttons and a popup that is in the list", () => {
  const card = offerCardDto(row({ id: "x" }), { open: true, seatsLeft: 3, seatsTotal: 10, endsAt: null });
  const reply = offersFromApi({ offers: [card, { ...card, id: "evil", ctaHref: "//evil.example" }], popupId: "x", sessionKey: "k" });
  assert.deepEqual(reply?.offers.map((o) => o.id), ["x"]);
  assert.equal(reply?.popupId, "x");
  assert.equal(offersFromApi({ offers: [card], popupId: "evil", sessionKey: "k" })?.popupId, null);
  assert.equal(offersFromApi({ error: "x" }), null);
  assert.equal(offersFromApi(null), null);
  const media = offersFromApi({ offers: [{ ...card, mediaUrl: "javascript:alert(1)", mediaKind: "image" }], popupId: null, sessionKey: null });
  assert.equal(media?.offers[0].mediaUrl, null);
  assert.equal(offerSeatsLineAr({ seatsLeft: 3, seatsTotal: 10 }), "بقي ٣ مقاعد من ١٠");
  assert.equal(offerSeatsLineAr({ seatsLeft: null, seatsTotal: null }), null);
});

// ── the admin's input (هـ12, هـ14, هـ17) ────────────────────────────────────

const PLANS = new Set(["lib-annual", "lawyer-founder-2026"]);

test("create: the required fields, same-site button, known plan, end after start", () => {
  const ok = offerInputToColumns(
    { title: " عرض الأفراد ", ctaLabel: "اطلب", ctaHref: "/pricing", audience: ["individual"], status: "active", planRef: "lib-annual", seatsTotal: 1 },
    null,
    PLANS,
  );
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.values.title, "عرض الأفراد");
    assert.deepEqual(ok.values.audience_account_types, ["individual"]);
    assert.equal(ok.values.dismiss_return_minutes, DEFAULT_RETURN_MINUTES);
    assert.equal(ok.values.seats_total, 1);
    assert.equal(Object.hasOwn(ok.values, "requires_invite_code"), false);
    assert.equal(Object.hasOwn(ok.values, "campaign_id"), false);
  }
  const base = { title: "x", ctaLabel: "y", ctaHref: "/pricing", audience: ["individual"] };
  assert.equal(offerInputToColumns({ ...base, title: "" }, null, PLANS).ok, false);
  assert.equal(offerInputToColumns({ ...base, ctaHref: "https://evil.example/" }, null, PLANS).ok, false);
  assert.equal(offerInputToColumns({ ...base, ctaHref: "//evil" }, null, PLANS).ok, false);
  assert.equal(offerInputToColumns({ ...base, audience: [] }, null, PLANS).ok, false);
  assert.equal(offerInputToColumns({ ...base, audience: ["admin"] }, null, PLANS).ok, false);
  assert.equal(offerInputToColumns({ ...base, planRef: "nope" }, null, PLANS).ok, false);
  assert.equal(offerInputToColumns({ ...base, status: "live" }, null, PLANS).ok, false);
  assert.equal(offerInputToColumns({ ...base, returnMinutes: 0 }, null, PLANS).ok, false);
  assert.equal(offerInputToColumns({ ...base, returnMinutes: 1 }, null, PLANS).ok, true, "1 minute for the test (هـ6)");
  assert.equal(offerInputToColumns({ ...base, startsAt: "2026-11-20T10:00:00+03:00", endsAt: "2026-11-20T09:00:00+03:00" }, null, PLANS).ok, false);
  assert.equal(offerInputToColumns({ ...base, mediaUrl: "javascript:alert(1)", mediaKind: "image" }, null, PLANS).ok, false);
  assert.equal(offerInputToColumns({ ...base, requiresInviteCode: "X" }, null, PLANS).ok, false, "the invite code is never set from the admin");
  assert.equal(offerInputToColumns({ ...base, campaignId: "founder-2026" }, null, PLANS).ok, false);
});

test("edit: only the fields sent; «إيقاف فوري» is { status: paused }; the founder row keeps its audience and seats", () => {
  const stop = offerInputToColumns({ status: "paused" }, { campaign_id: null, starts_at: null, ends_at: null }, PLANS);
  assert.deepEqual(stop, { ok: true, values: { status: "paused" } });
  assert.equal(offerInputToColumns({}, { campaign_id: null, starts_at: null, ends_at: null }, PLANS).ok, false);
  const founder = { campaign_id: "founder-2026", starts_at: null, ends_at: null };
  assert.deepEqual(offerInputToColumns({ title: "جديد", status: "paused" }, founder, PLANS), { ok: true, values: { title: "جديد", status: "paused" } });
  for (const k of ["audience", "verification", "excludeBuyers", "planRef", "seatsTotal", "seatsUsed"]) {
    assert.deepEqual(offerInputToColumns({ [k]: null }, founder, PLANS), { ok: false, error: FOUNDER_LOCKED_AR }, k);
  }
  // an end set alone is checked against the stored start
  assert.equal(offerInputToColumns({ endsAt: "2026-11-01T00:00:00Z" }, { campaign_id: null, starts_at: "2026-11-02T00:00:00Z", ends_at: null }, PLANS).ok, false);
});

// ── the founder banner and dashboard card read the row (هـ16) ───────────────

test("the founder row's copy: a stopped offer is not promoted; a foreign button is refused", () => {
  const copy = founderOfferCopyFromRow({ status: "active", title: "باقة", body: "نص", cta_label: "اعرف", cta_href: "/founder" });
  assert.deepEqual(copy, { promoted: true, title: "باقة", body: "نص", ctaLabel: "اعرف", ctaHref: "/founder" });
  assert.equal(founderOfferCopyFromRow({ status: "paused", title: "باقة", body: "", cta_label: "اعرف", cta_href: "/founder" })?.promoted, false);
  assert.equal(founderOfferCopyFromRow({ status: "active", title: "باقة", cta_label: "اعرف", cta_href: "//evil" }), null);
  assert.equal(founderOfferCopyFromApi({ founderOffer: null }), null);
  assert.equal(founderOfferCopyFromApi({ founderOffer: { promoted: false, title: "باقة", body: "", ctaLabel: "اعرف", ctaHref: "/founder" } })?.promoted, false);
});

test("the campaign banner: words from the row; hidden once the admin stops the offer; built-in words before the SQL", () => {
  assert.deepEqual(founderCampaignCopyFromOffer(null), FOUNDER_CAMPAIGN_COPY);
  const words = founderCampaignCopyFromOffer({ title: "عنوان", body: "", ctaLabel: "زر", ctaHref: "/founder" });
  assert.deepEqual(words, { badgeAr: "عنوان", messageAr: FOUNDER_CAMPAIGN_COPY.messageAr, ctaAr: "زر", ctaHref: "/founder" });
  const campaign = { id: "founder-2026-11-18", startsOn: "2026-11-18", endsOn: "2026-12-17", ...words, onSale: true };
  assert.equal(campaignFromApi({ campaign, founderOffer: { promoted: true } })?.ctaAr, "زر");
  assert.equal(campaignFromApi({ campaign, founderOffer: { promoted: false } }), null);
  assert.equal(campaignFromApi({ campaign, founderOffer: null })?.badgeAr, "عنوان");
});

test("the lawyer dashboard's campaign card reads the row and steps aside when it is stopped", () => {
  const base = {
    userLoading: false,
    userType: "lawyer",
    practiceKind: "advocate",
    membership: { member: false },
    view: { phase: "live", seatsLeft: 3 } as unknown as Parameters<typeof founderNoticeView>[0]["view"],
    inviteShown: false,
    dismissed: new Set<"pre" | "live">(),
  };
  const v = founderNoticeView({ ...base, copy: { promoted: true, title: "عنوان الأدمن", body: "", ctaLabel: "زر الأدمن", ctaHref: "/founder" } });
  assert.equal(v.kind, "join");
  if (v.kind === "join") {
    assert.equal(v.title, "عنوان الأدمن");
    assert.equal(v.linkLabel, "زر الأدمن");
  }
  assert.equal(founderNoticeView({ ...base, copy: { promoted: false, title: "x", body: "", ctaLabel: "y", ctaHref: "/founder" } }).kind, "none");
  assert.equal(founderNoticeView({ ...base, copy: null }).kind, "join", "before the SQL: the built-in card");
});

// ── source pins ────────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

test("requires_invite_code: in the SQL only — never selected, sent or shown (هـ17)", () => {
  assert.equal(OFFER_COLUMNS.includes("requires_invite_code"), false);
  const hits = walk(SRC).filter((f) => readFileSync(f, "utf8").includes("requires_invite_code"));
  // offerRules.ts names it in its header comment only
  for (const f of hits) {
    const code = readFileSync(f, "utf8")
      .split(/\r?\n/)
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .join("\n");
    assert.equal(code.includes("requires_invite_code"), false, f);
  }
  const sql = readFileSync(join(ROOT, "supabase", "migrations", "20261128_50_offers.sql"), "utf8");
  assert.ok(/requires_invite_code\s+text,/.test(sql), "the column exists, nullable, with no default");
});

test("the routes: the user route proves the session, then reads with the service client; events need an active offer", () => {
  const get = read("app", "api", "v1", "offers", "route.ts");
  assert.ok(get.indexOf("requireApiUser(") > -1 && get.indexOf("requireApiUser(") < get.indexOf("createServiceClient()"));
  assert.ok(get.includes('"private, no-store"'));
  const ev = read("app", "api", "v1", "offers", "[id]", "events", "route.ts");
  assert.ok(ev.indexOf("requireApiUser(") < ev.indexOf("createServiceClient()"));
  const server = read("lib", "offers", "offersServer.ts");
  assert.ok(server.includes('(offer.data as { status?: unknown }).status !== "active"'), "an event of a stopped offer records nothing");
  for (const w of ["founder_reserve_seat", "founder_activate", ".from(\"founder_seats\").update", ".from(\"payment_orders\").update", ".from(\"payment_orders\").insert"]) {
    assert.equal(server.includes(w), false, `the offers system never writes seats or payments (${w})`);
  }
});

test("the wiring: popup in the dashboard layout, «العروض» in every dashboard sidebar, the strip on /pricing", () => {
  const layout = read("app", "dashboard", "layout.tsx");
  assert.ok(layout.includes("<OfferPopup />"));
  const sidebar = read("components", "dashboard", "SharedSidebar.tsx");
  assert.ok(sidebar.includes("<OffersNavItem "));
  const pricing = read("app", "pricing", "page.tsx");
  assert.ok(pricing.includes('<OffersList variant="strip"'));
  const popup = read("components", "offers", "OfferPopup.tsx");
  assert.ok(popup.includes("popupAllowedOnPath(pathname)"));
  assert.ok(popup.includes('terms.kind === "needs_acceptance"'), "no popup while the terms re-ask is open");
  assert.ok(popup.includes('reportOfferEvent(offer.id, "dismiss")'));
  assert.equal(popup.includes("localStorage"), false, "same session = this tab's sessionStorage (هـ3 / هـ6)");
});

test("protocol هـ7 / هـ8: no founder surface for a signed-in consultant, individual, firm or company", () => {
  const banner = read("components", "pricing", "PromotionalCampaignBanner.tsx");
  assert.ok(banner.includes('(!isLoggedIn || (userType === "lawyer" && practiceKind !== "consultant"))'));
  assert.ok(banner.includes("if (!campaign || !audienceOk) return null;"));
  const pricing = read("app", "pricing", "page.tsx");
  assert.ok(pricing.includes('!(isLoggedIn && userType === "lawyer" && practiceKind === "consultant") && ('));
  const server = read("lib", "offers", "offersServer.ts");
  assert.ok(server.includes("if (lp.error) throw new OffersReadError("), "an unread practice kind fails closed");
});

test("the SQL: RLS on with no policy, the founder audience CHECK, the seed only when missing", () => {
  const sql = readFileSync(join(ROOT, "supabase", "migrations", "20261128_50_offers.sql"), "utf8");
  assert.ok(sql.includes("offers_founder_audience_check"));
  assert.ok(sql.includes("on conflict (slug) do nothing"));
  assert.ok(sql.includes("revoke all on public.%I from authenticated"));
  assert.equal(/create policy/i.test(sql), false);
  const verify = readFileSync(join(ROOT, "supabase", "migrations", "_verify.sql"), "utf8");
  assert.ok(verify.includes("-- >>> verify:l8_offers") && verify.includes("-- <<< verify:l8_offers"));
});
