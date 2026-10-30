/**
 * letterheadIdentity.ts — what a printed letterhead says about its issuer, from
 * GET /api/v1/branding (D4, owner ٢٥٦). Pure, so letterheadIdentity.test.ts
 * pins every decision; the components in src/components/letterhead/ only draw
 * the result.
 *
 * THE QR (owner: «الباركود الذكي … في ذيل/ختم المنصة»). Paper is permanent, so
 * the code must never lead to a 404:
 *   - a lawyer whose public profile is PUBLISHED (verified AND visible — the
 *     gate of /lawyers/[slug], profileShareState) → his profile URL, with the
 *     owner's caption «امسح الرمز … الملف الشخصي أو حجز استشارة»;
 *   - otherwise (an unpublished lawyer, and every firm: there is no public firm
 *     page) → the platform's home, captioned as the platform's stamp. The
 *     screen tells the lawyer why his own profile is not in the code yet.
 *
 * FIRMS — owner answer ٣١٤ (package 2026-10-30): «الصفحة الرئيسية حتى تُبنى
 * صفحات المكاتب، ومتى بُنيت فالوجهة ملف المكتب». There is no public firm page
 * yet (no src/app/firms), so FIRM_PUBLIC_PAGES_LIVE is false and a firm's code
 * carries the home page. The day /firms/[id] ships, flipping that ONE constant
 * points every firm letterhead at `${origin}/firms/<firm id>` (firmProfileUrl)
 * — letterheadIdentity.test.ts pins both states.
 * The origin is NEXT_PUBLIC_SITE_URL when it is an absolute http(s) URL, else
 * the page's own origin: an office printing from a LAN address must not put
 * `http://192.168.…` on paper when the site URL is known.
 */
import { profileShareState } from "../../app/dashboard/lawyer/_components/profileShareTargets.ts";
import { BRANDING_DEFAULT_ACCENT, type BrandingFields, type BrandingScope } from "./brandingVault.ts";

export const QR_CAPTION_PROFILE = "امسح الرمز بكاميرا الجوال للانتقال الفوري إلى الملف الشخصي أو حجز استشارة";
export const QR_CAPTION_PLATFORM = "امسح الرمز بكاميرا الجوال لزيارة منصة نظامي";
export const PLATFORM_STAMP_AR = "صادر عبر منصة نظامي";
export const QR_CAPTION_FIRM = "امسح الرمز بكاميرا الجوال للانتقال إلى صفحة المكتب على منصة نظامي";

/**
 * Owner ٣١٤: false until a public firm page exists. Set it to true in the same
 * commit that ships /firms/[id] — never before, or paper would carry a 404.
 */
export const FIRM_PUBLIC_PAGES_LIVE = false;

/** The firm's public page — the QR target once FIRM_PUBLIC_PAGES_LIVE is true. */
export function firmProfileUrl(origin: string, firmId: string): string {
  return `${origin.replace(/\/+$/, "")}/firms/${encodeURIComponent(firmId)}`;
}

/** The subset of GET /api/v1/branding a letterhead needs. */
export interface BrandingResponse {
  available: boolean;
  scope: BrandingScope;
  /** firm scope: the firm whose page the QR opens once firm pages exist (٣١٤). */
  firm?: { id: string } | null;
  fields: BrandingFields;
  logoUrl: string | null;
  licence: { number: string | null; verified: boolean };
  profile: {
    userId: string;
    slug: string | null;
    hasRoleProfile: boolean;
    readFailed: boolean;
    verificationStatus: string | null;
    marketplaceVisible: boolean;
  } | null;
}

export type QrTarget =
  | { kind: "profile"; url: string; caption: string }
  | { kind: "platform"; url: string; caption: string; reason: "unpublished" | "unverified" | "no_profile" | "firm" | "unknown" };

export interface LetterheadIdentity {
  nameAr: string;
  nameEn: string;
  /** «ترخيص رقم ١٢٣» — only a verified licence. */
  licenceLine: string | null;
  /** Address, phone, e-mail, website — the ones that have a value, in that order. */
  contacts: { kind: "address" | "phone" | "email" | "website"; text: string; ltr: boolean }[];
  logoUrl: string | null;
  accent: string;
  qr: QrTarget;
}

export function letterheadOrigin(siteUrl: string | null | undefined, pageOrigin: string): string {
  const raw = (siteUrl ?? "").trim();
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch {
      /* fall through to the page's origin */
    }
  }
  return pageOrigin.replace(/\/+$/, "");
}

export function qrTargetFor(
  res: Pick<BrandingResponse, "scope" | "profile"> & { firm?: BrandingResponse["firm"] },
  origin: string,
  firmPagesLive: boolean = FIRM_PUBLIC_PAGES_LIVE,
): QrTarget {
  const platform = (reason: Extract<QrTarget, { kind: "platform" }>["reason"]): QrTarget =>
    ({ kind: "platform", url: origin, caption: QR_CAPTION_PLATFORM, reason });
  if (res.scope === "firm") {
    // Owner ٣١٤: home page until firm pages exist, then the firm's own page.
    if (firmPagesLive && res.firm?.id) return { kind: "profile", url: firmProfileUrl(origin, res.firm.id), caption: QR_CAPTION_FIRM };
    return platform("firm");
  }
  const p = res.profile;
  if (!p) return platform("unknown");
  const state = profileShareState({
    origin,
    userId: p.userId,
    slug: p.slug,
    hasRoleProfile: p.hasRoleProfile,
    roleProfileReadFailed: p.readFailed,
    verificationStatus: p.verificationStatus,
    marketplaceVisible: p.marketplaceVisible,
  });
  if (state.kind === "published") return { kind: "profile", url: state.url, caption: QR_CAPTION_PROFILE };
  if (state.kind === "unpublished") return platform(state.verified ? "unpublished" : "unverified");
  return platform(state.kind === "no_profile" ? "no_profile" : "unknown");
}

/** Western digits → Arabic-Indic, for the licence line only (numbers in contacts stay as typed). */
function arabicDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

export function buildLetterheadIdentity(res: BrandingResponse, origin: string): LetterheadIdentity {
  const f = res.fields;
  const contacts: LetterheadIdentity["contacts"] = [];
  if (f.address) contacts.push({ kind: "address", text: f.address, ltr: false });
  if (f.phone) contacts.push({ kind: "phone", text: f.phone, ltr: true });
  if (f.email) contacts.push({ kind: "email", text: f.email, ltr: true });
  if (f.website) contacts.push({ kind: "website", text: f.website.replace(/^https?:\/\//i, "").replace(/\/$/, ""), ltr: true });
  const licence = res.licence.verified && res.licence.number ? res.licence.number.trim() : "";
  return {
    nameAr: f.display_name_ar.trim(),
    nameEn: f.display_name_en.trim(),
    licenceLine: licence ? `ترخيص رقم ${arabicDigits(licence)}` : null,
    contacts,
    logoUrl: res.logoUrl,
    accent: /^#[0-9A-Fa-f]{6}$/.test(f.accent_color) ? f.accent_color : BRANDING_DEFAULT_ACCENT,
    qr: qrTargetFor(res, origin),
  };
}

/** Why the code shows the platform and not the lawyer's own profile — for the screen, never the paper. */
export function qrNoteAr(qr: QrTarget): string | null {
  if (qr.kind === "profile") return null;
  switch (qr.reason) {
    case "unverified":
      return "يحمل الرمز رابط منصة نظامي؛ يصبح رابط ملفك الشخصي بعد توثيق ملفك ونشره في الدليل.";
    case "unpublished":
      return "ملفك موثّق لكنه غير منشور؛ فعّل الظهور في محرر الملف ليحمل الرمز رابط ملفك الشخصي.";
    case "no_profile":
      return "أكمل ملفك المهني ليحمل الرمز رابط ملفك الشخصي؛ يحمل الآن رابط منصة نظامي.";
    case "firm":
      return "لا توجد صفحة عامة للمكاتب بعد؛ يحمل الرمز رابط منصة نظامي، ويتحول إلى صفحة المكتب فور إطلاقها (قرار المالك ٣١٤).";
    default:
      return "تعذّر التحقق من نشر ملفك؛ يحمل الرمز رابط منصة نظامي.";
  }
}
