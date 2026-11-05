import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { EMPTY_BRANDING_FIELDS } from "./brandingVault.ts";
import {
  FIRM_PUBLIC_PAGES_LIVE,
  QR_CAPTION_FIRM,
  firmProfileUrl,
  QR_CAPTION_CARD,
  QR_CAPTION_PLATFORM,
  QR_CAPTION_PROFILE,
  buildLetterheadIdentity,
  letterheadOrigin,
  qrNoteAr,
  qrTargetFor,
  type BrandingResponse,
} from "./letterheadIdentity.ts";

const UID = "0f8e2c1a-5b7d-4e3a-9c1f-2a6b8d4e0c9f";
const ORIGIN = "https://nezamy.sa";

function lawyer(over: Partial<NonNullable<BrandingResponse["profile"]>> = {}): BrandingResponse {
  return {
    available: true,
    scope: "lawyer",
    fields: { ...EMPTY_BRANDING_FIELDS, display_name_ar: "أ. فهد الشمري" },
    logoUrl: null,
    licence: { number: null, verified: false },
    profile: { userId: UID, slug: "fahad", hasRoleProfile: true, readFailed: false, verificationStatus: "verified", marketplaceVisible: true, ...over },
  };
}

test("a published lawyer's QR is his profile, with the owner's caption", () => {
  const qr = qrTargetFor(lawyer(), ORIGIN);
  assert.deepEqual(qr, { kind: "profile", url: "https://nezamy.sa/lawyers/fahad", caption: QR_CAPTION_PROFILE });
  assert.equal(qrNoteAr(qr), null);
  assert.equal(qrTargetFor(lawyer({ slug: null }), ORIGIN).url, `https://nezamy.sa/lawyers/${UID}`);
});

test("no QR ever points at a page that would 404", () => {
  for (const [over, reason] of [
    [{ verificationStatus: "pending" }, "unverified"],
    [{ marketplaceVisible: false }, "unpublished"],
    [{ hasRoleProfile: false }, "no_profile"],
    [{ readFailed: true }, "unknown"],
  ] as const) {
    const qr = qrTargetFor(lawyer(over), ORIGIN);
    assert.equal(qr.kind, "platform", JSON.stringify(over));
    assert.equal(qr.url, ORIGIN);
    assert.equal(qr.caption, QR_CAPTION_PLATFORM);
    if (qr.kind === "platform") assert.equal(qr.reason, reason);
    assert.ok(qrNoteAr(qr));
  }
  const firm = qrTargetFor({ scope: "firm", profile: null }, ORIGIN);
  assert.equal(firm.kind === "platform" && firm.reason, "firm");
});

test("the site URL wins over a LAN page origin; a bad one falls back", () => {
  assert.equal(letterheadOrigin("https://nezamy.sa/", "http://192.168.1.5:3000"), "https://nezamy.sa");
  assert.equal(letterheadOrigin(undefined, "http://192.168.1.5:3000/"), "http://192.168.1.5:3000");
  assert.equal(letterheadOrigin("not a url", "https://staging.nezamy.sa"), "https://staging.nezamy.sa");
  assert.equal(letterheadOrigin("javascript:alert(1)", "https://nezamy.sa"), "https://nezamy.sa");
});

test("the licence prints only when verified; contacts keep their order and skip blanks", () => {
  const res = lawyer();
  res.licence = { number: "41/182", verified: true };
  res.fields = { ...res.fields, phone: "0501234567", website: "https://f-law.sa/", address: "الرياض", accent_color: "bad" };
  const id = buildLetterheadIdentity(res, ORIGIN);
  assert.equal(id.licenceLine, "ترخيص رقم ٤١/١٨٢");
  assert.deepEqual(id.contacts.map((c) => c.kind), ["address", "phone", "website"]);
  assert.equal(id.contacts[2].text, "f-law.sa");
  assert.equal(id.accent, "#C8A762");
  res.licence = { number: "41/182", verified: false };
  assert.equal(buildLetterheadIdentity(res, ORIGIN).licenceLine, null);
});

// ─── Owner ٣١٤ (package 2026-10-30): the firm's QR ───────────────────────────
test("٣١٤: a firm's QR is the home page while no firm page exists, then the firm's own page", () => {
  const firmRes = { scope: "firm" as const, profile: null, firm: { id: "a1b2c3d4-0000-4000-8000-000000000001" } };
  // Today: no public firm page in the app, so the flag must be off and the
  // code must carry the home page — never a /firms/… 404 on paper.
  assert.equal(existsSync(new URL("../../app/firms", import.meta.url)), FIRM_PUBLIC_PAGES_LIVE,
    "FIRM_PUBLIC_PAGES_LIVE is true exactly when src/app/firms exists");
  const today = qrTargetFor(firmRes, ORIGIN);
  assert.equal(today.kind, "platform");
  assert.equal(today.url, ORIGIN);
  assert.equal(today.kind === "platform" && today.reason, "firm");
  assert.match(qrNoteAr(today) ?? "", /٣١٤/);
  // The day firm pages ship: the firm's page, with its own caption.
  const later = qrTargetFor(firmRes, ORIGIN, true);
  assert.deepEqual(later, { kind: "profile", url: `${ORIGIN}/firms/${firmRes.firm.id}`, caption: QR_CAPTION_FIRM });
  assert.equal(firmProfileUrl("https://nezamy.sa/", "x y"), "https://nezamy.sa/firms/x%20y");
  // A firm response without its id never points at /firms/undefined.
  assert.equal(qrTargetFor({ scope: "firm", profile: null }, ORIGIN, true).url, ORIGIN);
  // buildLetterheadIdentity passes the firm through to the QR.
  const id = buildLetterheadIdentity({ ...lawyer(), scope: "firm", profile: null, firm: firmRes.firm }, ORIGIN);
  assert.equal(id.qr.url, ORIGIN);
});

// ── q343: the verification card and its privacy switch ─────────────────────
const CARD_TOKEN = "abcdefghijklmnopqrstuvwxyz234567";
const unpublished = { userId: "u1", slug: "s", hasRoleProfile: true, readFailed: false, verificationStatus: "verified", marketplaceVisible: false };

test("verified unpublished lawyer with the card on gets the card", () => {
  assert.deepEqual(
    qrTargetFor({ scope: "lawyer", profile: unpublished, verifyCard: { token: CARD_TOKEN, enabled: true } }, ORIGIN),
    { kind: "card", url: `${ORIGIN}/verify/${CARD_TOKEN}`, caption: QR_CAPTION_CARD },
  );
});

test("card off: the platform, with the reason, and the token appears nowhere", () => {
  const qr = qrTargetFor({ scope: "lawyer", profile: unpublished, verifyCard: { token: CARD_TOKEN, enabled: false } }, ORIGIN);
  assert.equal(qr.kind, "platform");
  assert.equal((qr as Extract<typeof qr, { kind: "platform" }>).reason, "unpublished");
  assert.equal(qr.url, ORIGIN);
  assert.ok(!JSON.stringify(qr).includes(CARD_TOKEN));
  assert.equal(qrNoteAr(qr, { token: null, enabled: false }), "الرمز يحمل رابط المنصة لأنك أوقفت بطاقة التحقق من إعدادات الخصوصية");
});

test("the printed identity honours the switch: its QR is what the sheet and the Word footer draw", () => {
  const res = (verifyCard: BrandingResponse["verifyCard"]): BrandingResponse => ({ ...lawyer({ marketplaceVisible: false }), verifyCard });
  assert.equal(buildLetterheadIdentity(res({ token: CARD_TOKEN, enabled: true }), ORIGIN).qr.url, `${ORIGIN}/verify/${CARD_TOKEN}`);
  assert.equal(buildLetterheadIdentity(res({ token: null, enabled: false }), ORIGIN).qr.url, ORIGIN);
  assert.equal(buildLetterheadIdentity(res({ token: CARD_TOKEN, enabled: false }), ORIGIN).qr.url, ORIGIN);
});

test("card on but no token, or no answer at all (20261103_69 not run): the platform, as today", () => {
  for (const verifyCard of [{ token: null, enabled: true }, null, undefined]) {
    const qr = qrTargetFor({ scope: "lawyer", profile: unpublished, verifyCard }, ORIGIN);
    assert.equal(qr.kind, "platform");
    assert.equal(qr.url, ORIGIN);
  }
  const qr = qrTargetFor({ scope: "lawyer", profile: unpublished, verifyCard: { token: null, enabled: true } }, ORIGIN);
  assert.match(qrNoteAr(qr, { token: null, enabled: true }) ?? "", /فعّل الظهور/, "the old note, not the switch's");
});

test("published wins: a card is never shown to someone whose profile is public", () => {
  assert.equal(
    qrTargetFor({ scope: "lawyer", profile: { ...unpublished, marketplaceVisible: true }, verifyCard: { token: CARD_TOKEN, enabled: true } }, ORIGIN).kind,
    "profile",
  );
});

test("an unverified lawyer never gets a card, whatever the row says", () => {
  const qr = qrTargetFor({ scope: "lawyer", profile: { ...unpublished, verificationStatus: "pending" }, verifyCard: { token: CARD_TOKEN, enabled: true } }, ORIGIN);
  assert.equal(qr.kind, "platform");
  assert.equal((qr as Extract<typeof qr, { kind: "platform" }>).reason, "unverified");
});

test("firm never gets a card", () => {
  const qr = qrTargetFor({ scope: "firm", profile: null, verifyCard: { token: CARD_TOKEN, enabled: true } }, ORIGIN);
  assert.equal((qr as Extract<typeof qr, { kind: "platform" }>).reason, "firm");
});

test("the card's own note says what it shows and where it is switched off", () => {
  const qr = qrTargetFor({ scope: "lawyer", profile: unpublished, verifyCard: { token: CARD_TOKEN, enabled: true } }, ORIGIN);
  assert.match(qrNoteAr(qr, { token: CARD_TOKEN, enabled: true }) ?? "", /إعدادات الخصوصية/);
});
