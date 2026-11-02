import assert from "node:assert/strict";
import test from "node:test";
import { postLoginPath } from "../auth/postLoginPath.ts";
import { stashablePostLoginPath } from "../auth/postLoginCookie.ts";
import { FOUNDER_CAMPAIGN_ID, FOUNDER_CREDITS, FOUNDER_PLAN_ID } from "../membership/founderPlan.ts";
import { PAYABLE_ITEMS } from "../payments/catalog.ts";
import {
  FOUNDER_BENEFITS,
  FOUNDER_CARD_TITLE,
  FOUNDER_CLOSED_TEXT,
  FOUNDER_CONSULTANT_NOTE,
  FOUNDER_FINE_PRINT,
  FOUNDER_GUEST_LOGIN_HREF,
  FOUNDER_PAUSED_TEXT,
  FOUNDER_PLAN_ANCHOR,
  FOUNDER_REGISTER_HREF,
  FOUNDER_TERM_LINE,
  FOUNDER_VERIFY_HREF,
  audienceFromParam,
  founderCta,
  founderEndsLine,
  founderMemberFromReply,
  founderOfferFromApi,
  founderPriceLine,
  founderSectionView,
  founderSeatsLine,
  founderVatLine,
  founderVerificationFromProfile,
  type FounderCtaState,
} from "./founderCard.ts";

// ── the copy (brief, verbatim) ──────────────────────────────────────────────

test("the card copy is the brief's, verbatim", () => {
  assert.equal(FOUNDER_PLAN_ANCHOR, "founder-plan");
  assert.equal(FOUNDER_CARD_TITLE, "باقة المحامي المؤسس");
  assert.equal(FOUNDER_TERM_LINE, "للسنة الأولى، ١٢ شهرًا من التفعيل");
  assert.deepEqual(FOUNDER_BENEFITS, [
    "٦ أعمال بالصائغ القانوني (يمكن تكرار النوع)",
    "مخرج مستقل واحد تختاره من: محترف العقود، الرأي الفصل، المحاكي الشامل، داعم الاتجاه (قريبًا)",
    "المكتبة القانونية ١٢ شهرًا",
    "إدارة المكتب: قريبًا — ضمن مدة العضوية المحسوبة من التفعيل",
  ]);
  assert.equal(FOUNDER_FINE_PRINT, "لا يُعدّ سعر السنة الأولى سعر تجديد ثابتًا");
  assert.equal(FOUNDER_CLOSED_TEXT, "انتهت حملة المؤسس أو اكتملت مقاعدها");
  assert.equal(FOUNDER_PAUSED_TEXT, "البيع متوقف مؤقتًا — تابعنا لموعد الاستئناف");
  assert.equal(FOUNDER_CONSULTANT_NOTE, "حساب المستشار: لا يشمل الصائغ القانوني والمحاكي الشامل");
  // «مخرج مستقل واحد» is written out; it must stay what one activation grants.
  assert.equal(FOUNDER_CREDITS.independent_output, 1);
});

test("the card promises nothing the plan does not grant", () => {
  const all = [FOUNDER_CARD_TITLE, FOUNDER_TERM_LINE, ...FOUNDER_BENEFITS, FOUNDER_FINE_PRINT].join(" ");
  assert.doesNotMatch(all, /دعو|ضيف|استمرار|مهلة|عمولة|توصية|غرفة|أكاديمي|٢٥ ?(جيجا|GB)|25 ?GB/);
  assert.doesNotMatch(all, /الأكثر|الأفضل|الأوفر|خصم|وفّر|وفر/);
});

test("the price line is computed from quote(): 2,996 before VAT, 3,445.40 total", () => {
  assert.equal(founderPriceLine(), "٢٬٩٩٦ ر.س قبل الضريبة — الإجمالي ٣٬٤٤٥٫٤٠ ر.س");
  // It follows the book, never a typed number.
  const item = PAYABLE_ITEMS[FOUNDER_PLAN_ID];
  const cheaper = { ...PAYABLE_ITEMS, [FOUNDER_PLAN_ID]: { ...item, prices: { once: 100000 } } };
  assert.equal(founderPriceLine(cheaper), "١٬٠٠٠ ر.س قبل الضريبة — الإجمالي ١٬١٥٠ ر.س");
  // Not sold → no price line (the card hides).
  const off = { ...PAYABLE_ITEMS, [FOUNDER_PLAN_ID]: { ...item, onSale: false } };
  assert.equal(founderPriceLine(off), null);
});

test("R33: the VAT breakdown is computed from quote(): 2,996 + 449.40 VAT = 3,445.40", () => {
  assert.equal(founderVatLine(), "٢٬٩٩٦ + ٤٤٩٫٤٠ ضريبة القيمة المضافة = ٣٬٤٤٥٫٤٠ ر.س");
  const item = PAYABLE_ITEMS[FOUNDER_PLAN_ID];
  const cheaper = { ...PAYABLE_ITEMS, [FOUNDER_PLAN_ID]: { ...item, prices: { once: 100000 } } };
  assert.equal(founderVatLine(cheaper), "١٬٠٠٠ + ١٥٠ ضريبة القيمة المضافة = ١٬١٥٠ ر.س");
  const odd = { ...PAYABLE_ITEMS, [FOUNDER_PLAN_ID]: { ...item, prices: { once: 100005 } } };
  assert.equal(founderVatLine(odd), "١٬٠٠٠٫٠٥ + ١٥٠٫٠١ ضريبة القيمة المضافة = ١٬١٥٠٫٠٦ ر.س");
  const off = { ...PAYABLE_ITEMS, [FOUNDER_PLAN_ID]: { ...item, onSale: false } };
  assert.equal(founderVatLine(off), null);
});

test("R33: the end date is the setting's ends_on as an Arabic Gregorian day, or nothing", () => {
  assert.equal(founderEndsLine("2027-01-25"), "آخر يوم في الحملة: ٢٥ يناير ٢٠٢٧");
  assert.equal(founderEndsLine("2026-12-31"), "آخر يوم في الحملة: ٣١ ديسمبر ٢٠٢٦");
  for (const bad of [undefined, null, "", "2027-02-30", "2027-01-25T00:00:00Z", 20270125]) {
    assert.equal(founderEndsLine(bad), null, JSON.stringify(bad));
  }
});

test("the seats line uses the live capacity, Arabic-Indic digits", () => {
  assert.equal(founderSeatsLine(1096, 1096), "المقاعد المتبقية: ١٬٠٩٦ من ١٬٠٩٦");
  assert.equal(founderSeatsLine(7, 1096), "المقاعد المتبقية: ٧ من ١٬٠٩٦");
  assert.equal(founderSeatsLine(12, 500), "المقاعد المتبقية: ١٢ من ٥٠٠");
});

// ── the campaign route body ─────────────────────────────────────────────────

const OPEN = {
  campaign: {
    id: "founder-2026-11-01", startsOn: "2026-11-01", endsOn: "2027-01-25",
    badgeAr: "ب", messageAr: "م", ctaAr: "ز", ctaHref: "/pricing",
    planId: FOUNDER_PLAN_ID, onSale: true, seatsLeft: 1000, capacity: 1096,
  },
};

test("founderOfferFromApi: open, closed or unavailable", () => {
  assert.deepEqual(founderOfferFromApi(OPEN), { state: "open", seatsLeft: 1000, capacity: 1096, endsOn: "2027-01-25" });
  // No usable endsOn: the card simply has no end-date line.
  assert.deepEqual(founderOfferFromApi({ campaign: { ...OPEN.campaign, endsOn: "x" } }), { state: "open", seatsLeft: 1000, capacity: 1096 });
  assert.deepEqual(founderOfferFromApi({ campaign: null }), { state: "closed" });
  assert.deepEqual(founderOfferFromApi({ campaign: { ...OPEN.campaign, onSale: false } }), { state: "closed" });
  assert.deepEqual(founderOfferFromApi({ campaign: { ...OPEN.campaign, onSale: false, salePaused: false } }), { state: "closed" });
  // R31: paused with seats left is its own state; paused AND full reads closed.
  assert.deepEqual(founderOfferFromApi({ campaign: { ...OPEN.campaign, onSale: false, salePaused: true } }), { state: "paused" });
  assert.deepEqual(founderOfferFromApi({ campaign: { ...OPEN.campaign, onSale: false, salePaused: true, seatsLeft: 0 } }), { state: "closed" });
  assert.deepEqual(founderOfferFromApi({ campaign: { ...OPEN.campaign, onSale: false, salePaused: "true" } }), { state: "closed" });
  // A read failure is not «the campaign ended».
  assert.deepEqual(founderOfferFromApi({ campaign: null, founderUnavailable: true }), { state: "unavailable" });
  assert.deepEqual(founderOfferFromApi(null), { state: "unavailable" });
  assert.deepEqual(founderOfferFromApi("x"), { state: "unavailable" });
  // On sale but the numbers are unusable, or another plan → unavailable.
  for (const bad of [
    { seatsLeft: "5" }, { seatsLeft: 0 }, { seatsLeft: 2.5 }, { capacity: 0 }, { capacity: null }, { planId: "lawyer-pro" },
  ]) {
    assert.deepEqual(founderOfferFromApi({ campaign: { ...OPEN.campaign, ...bad } }), { state: "unavailable" }, JSON.stringify(bad));
  }
});

// ── whether the section renders ─────────────────────────────────────────────

const open = { state: "open", seatsLeft: 3, capacity: 1096 } as const;

test("founderSectionView: the card only on the lawyers tab while on sale", () => {
  const base = { audience: "lawyers", libraryMode: false, campaignParam: null, offer: open, priced: true } as const;
  assert.equal(founderSectionView(base), "card");
  assert.equal(founderSectionView({ ...base, campaignParam: "founder-2026" }), "card");
  assert.equal(founderSectionView({ ...base, audience: "individuals" }), "hidden");
  assert.equal(founderSectionView({ ...base, audience: "firms" }), "hidden");
  assert.equal(founderSectionView({ ...base, libraryMode: true }), "hidden");
  assert.equal(founderSectionView({ ...base, offer: null }), "hidden", "still loading");
  assert.equal(founderSectionView({ ...base, priced: false }), "hidden", "no price, no card");
});

test("founderSectionView: a closed sale says so only to a visitor who came from the campaign link", () => {
  const base = { audience: "lawyers", libraryMode: false, offer: { state: "closed" }, priced: true } as const;
  assert.equal(founderSectionView({ ...base, campaignParam: FOUNDER_CAMPAIGN_ID }), "closed");
  assert.equal(founderSectionView({ ...base, campaignParam: null }), "hidden");
  // The id founderCampaignFromSetting builds is not the campaign id.
  assert.equal(founderSectionView({ ...base, campaignParam: "founder-2026-11-01" }), "hidden");
  assert.equal(founderSectionView({ ...base, campaignParam: "FOUNDER-2026" }), "hidden");
  // A failed read never claims the campaign ended.
  assert.equal(founderSectionView({ ...base, offer: { state: "unavailable" }, campaignParam: FOUNDER_CAMPAIGN_ID }), "hidden");
  assert.equal(founderSectionView({ ...base, offer: { state: "unavailable" }, campaignParam: null }), "hidden");
});

test("founderSectionView R31: a paused sale says so only to a campaign-link visitor; others see nothing", () => {
  const base = { audience: "lawyers", libraryMode: false, offer: { state: "paused" }, priced: true } as const;
  assert.equal(founderSectionView({ ...base, campaignParam: FOUNDER_CAMPAIGN_ID }), "paused");
  assert.equal(founderSectionView({ ...base, campaignParam: null }), "hidden");
  assert.equal(founderSectionView({ ...base, campaignParam: "founder-2026-11-01" }), "hidden");
  assert.equal(founderSectionView({ ...base, audience: "firms", campaignParam: FOUNDER_CAMPAIGN_ID }), "hidden");
  assert.equal(founderSectionView({ ...base, libraryMode: true, campaignParam: FOUNDER_CAMPAIGN_ID }), "hidden");
});

test("audienceFromParam: a real tab, or null", () => {
  assert.equal(audienceFromParam("lawyers"), "lawyers");
  assert.equal(audienceFromParam("firms"), "firms");
  assert.equal(audienceFromParam("Lawyers"), null);
  assert.equal(audienceFromParam("admin"), null);
  assert.equal(audienceFromParam(""), null);
  assert.equal(audienceFromParam(null), null);
  assert.equal(audienceFromParam("hasOwnProperty"), null);
});

// ── the CTA ─────────────────────────────────────────────────────────────────

const MOYASAR = { disabled: false, provider: "moyasar", loading: false };
const lawyer: FounderCtaState = {
  sessionLoading: false,
  signedIn: true,
  userType: "lawyer",
  practiceKind: "advocate",
  verification: "verified",
  member: false,
  gateway: MOYASAR,
};
const CHECKOUT = "/checkout?item=lawyer-founder-2026&billing=once";

test("founderCta: a guest signs in, then lands on the founder checkout", () => {
  const cta = founderCta({ ...lawyer, signedIn: false, userType: null, practiceKind: null, verification: "loading", member: "loading" });
  assert.equal(cta.kind, "guest");
  assert.equal(FOUNDER_GUEST_LOGIN_HREF, "/login?next=/checkout?item=lawyer-founder-2026%26billing=once");
  assert.equal(FOUNDER_REGISTER_HREF, "/register/provider?plan=lawyer-founder-2026");
  if (cta.kind !== "guest") return;
  assert.equal(cta.href, FOUNDER_GUEST_LOGIN_HREF);
  assert.equal(cta.registerHref, FOUNDER_REGISTER_HREF);
  assert.equal(cta.note, null);
  // /login reads ?next= with URLSearchParams; the whole checkout path survives
  // and postLoginPath (and the OAuth stash) keep it on this site, query intact.
  const next = new URLSearchParams(cta.href.split("?").slice(1).join("?")).get("next");
  assert.equal(next, CHECKOUT);
  assert.equal(postLoginPath(next, "/dashboard"), CHECKOUT);
  assert.equal(stashablePostLoginPath(next), CHECKOUT);
});

test("founderCta: nothing is offered while the session or the reads are loading", () => {
  assert.equal(founderCta({ ...lawyer, sessionLoading: true }).kind, "loading");
  assert.equal(founderCta({ ...lawyer, member: "loading" }).kind, "loading");
  assert.equal(founderCta({ ...lawyer, verification: "loading" }).kind, "loading");
});

test("founderCta: an existing member sees «أنت عضو مؤسس» — before any verification check", () => {
  for (const verification of ["verified", "unverified", "unknown", "loading"] as const) {
    const cta = founderCta({ ...lawyer, member: true, verification });
    assert.equal(cta.kind, "member", verification);
    assert.equal(cta.label, "أنت عضو مؤسس");
  }
});

test("founderCta: an unverified lawyer is sent to the licence upload", () => {
  const cta = founderCta({ ...lawyer, verification: "unverified" });
  assert.equal(cta.kind, "verify");
  assert.equal(cta.label, "وثّق رخصتك أولاً");
  if (cta.kind === "verify") assert.equal(cta.href, FOUNDER_VERIFY_HREF);
  assert.equal(FOUNDER_VERIFY_HREF, "/dashboard/lawyer/profile/edit#licence-image");
});

test("founderCta: a verified lawyer goes to checkoutHref", () => {
  const cta = founderCta(lawyer);
  assert.equal(cta.kind, "checkout");
  if (cta.kind === "checkout") assert.equal(cta.href, CHECKOUT);
  assert.equal(cta.note, null);
});

test("founderCta: an unreadable profile or membership never blocks — the checkout gate decides", () => {
  assert.equal(founderCta({ ...lawyer, verification: "unknown" }).kind, "checkout");
  assert.equal(founderCta({ ...lawyer, member: "unknown" }).kind, "checkout");
});

test("founderCta: the gateway still loading waits; the gateway off says so", () => {
  assert.equal(founderCta({ ...lawyer, gateway: { ...MOYASAR, loading: true } }).kind, "wait");
  const off = founderCta({ ...lawyer, gateway: { disabled: true, provider: null, loading: false } });
  assert.equal(off.kind, "unavailable");
  assert.match(off.label, /غير متاح/);
  // The stub gateway cannot take a checkout either.
  assert.equal(founderCta({ ...lawyer, gateway: { disabled: false, provider: "stub", loading: false } }).kind, "unavailable");
});

test("founderCta: a signed-in account that is not a lawyer is told the plan is for lawyers", () => {
  for (const userType of ["individual", "firm", "admin", "provider", null]) {
    const cta = founderCta({ ...lawyer, userType });
    assert.equal(cta.kind, "lawyers_only", String(userType));
    assert.match(cta.label, /للمحامين/);
  }
});

test("founderCta (R19): a consultant sees the note and may still check out (owner ٤٠٧ decides)", () => {
  const consultant = { ...lawyer, practiceKind: "consultant" } as const;
  const cta = founderCta(consultant);
  assert.equal(cta.kind, "checkout");
  assert.equal(cta.note, FOUNDER_CONSULTANT_NOTE);
  assert.equal(founderCta({ ...consultant, verification: "unverified" }).note, FOUNDER_CONSULTANT_NOTE);
  assert.equal(founderCta({ ...consultant, member: true }).note, FOUNDER_CONSULTANT_NOTE);
  assert.equal(founderCta({ ...consultant, gateway: { disabled: true, provider: null } }).note, FOUNDER_CONSULTANT_NOTE);
  // An advocate never sees it.
  assert.equal(founderCta({ ...lawyer, verification: "unverified" }).note, null);
});

// ── the two reads behind the CTA ────────────────────────────────────────────

test("founderVerificationFromProfile: only an exact 'verified' is verified; a failed read is unknown", () => {
  assert.equal(founderVerificationFromProfile({ roleProfile: { verification_status: "verified" } }), "verified");
  assert.equal(founderVerificationFromProfile({ roleProfile: { verification_status: "pending" } }), "unverified");
  assert.equal(founderVerificationFromProfile({ roleProfile: { verification_status: null } }), "unverified");
  assert.equal(founderVerificationFromProfile({ roleProfile: null, roleProfileReadFailed: false }), "unverified");
  assert.equal(founderVerificationFromProfile({ roleProfile: null, roleProfileReadFailed: true }), "unknown");
  assert.equal(founderVerificationFromProfile({ error: "x" }), "unknown");
  assert.equal(founderVerificationFromProfile(null), "unknown");
});

test("founderMemberFromReply: exactly true or false, anything else unknown", () => {
  assert.equal(founderMemberFromReply({ member: true }), true);
  assert.equal(founderMemberFromReply({ member: false }), false);
  assert.equal(founderMemberFromReply({ error: "تعذّر" }), "unknown");
  assert.equal(founderMemberFromReply({ member: "true" }), "unknown");
  assert.equal(founderMemberFromReply(null), "unknown");
});
