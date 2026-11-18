/**
 * structuredData.ts — the site's own JSON-LD (owner message 18 Nov, items
 * 4.4–4.6; SEO audit ع1, ع5, م3): FAQPage for /faq, the Organization of the
 * home page, and the founder campaign's Product + Offer for /founder.
 *
 * Every builder returns a plain object; the pages print it with
 * serializeJsonLd (escapes `<`, so no text can close the <script>). The
 * library documents keep their own builder (src/lib/library/libraryMetadata.ts).
 *
 * Pure: relative imports only, so `node --test` loads it.
 */

import { quote } from "../payments/catalog.ts";
import { FOUNDER_PLAN_ID } from "../membership/founderPlan.ts";
import { LEGAL_IDENTITY_AR } from "../../constants/legalIdentity.ts";

export { serializeJsonLd } from "../library/libraryMetadata.ts";

export const SITE_URL = "https://nezamy.sa";

/* ── FAQPage ─────────────────────────────────────────────────────────────── */

export interface FaqPair {
  question: string;
  answer: string;
}

/**
 * FAQPage from the very pairs the page shows (Google: the marked-up answers
 * must be visible on the page). Empty pairs are dropped; no pairs → null.
 */
export function buildFaqPageJsonLd(pairs: readonly FaqPair[], pageUrl: string): Record<string, unknown> | null {
  const items = pairs
    .map((p) => ({ q: String(p.question ?? "").trim(), a: String(p.answer ?? "").trim() }))
    .filter((p) => p.q && p.a);
  if (items.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: pageUrl,
    inLanguage: "ar",
    mainEntity: items.map((p) => ({
      "@type": "Question",
      name: p.q,
      acceptedAnswer: { "@type": "Answer", text: p.a },
    })),
  };
}

/* ── Organization ────────────────────────────────────────────────────────── */

/**
 * The registry fields the owner sends (audit ع5, owner item 4.5): «بيانات
 * السجل التجاري ورقم الترخيص تأتي من المالك، فاجعلوا الحقل جاهزاً».
 * EMPTY until he sends them — an empty field is left out of the JSON-LD,
 * never printed as "". Fill the strings below (Latin digits) and deploy:
 *   legalName              the name on the commercial registration
 *   commercialRegistration the CR number (السجل التجاري)
 *   licence                the licence number the owner names, and its issuer
 * Not «شركة نظامي للمحاماة»: owner decision Q27 (src/constants/legalIdentity.ts)
 * — نظامي is a LegalTech provider, not a law firm.
 */
export const ORGANIZATION_REGISTRY: Readonly<{
  legalName: string;
  commercialRegistration: string;
  licence: string;
  licenceIssuer: string;
}> = Object.freeze({
  legalName: "",
  commercialRegistration: "",
  licence: "",
  licenceIssuer: "",
});

/** Public contact details, as /contact prints them. */
const ORGANIZATION_CONTACT = Object.freeze({
  telephone: "+966560655552",
  email: "support@nezamy.sa",
  address: {
    "@type": "PostalAddress",
    streetAddress: "بطحاء قريش",
    addressLocality: "مكة المكرمة",
    postalCode: "24362",
    addressCountry: "SA",
  },
  /** Verified accounts only (contact/page.tsx: LinkedIn answered 404 when checked). */
  sameAs: ["https://x.com/nezamy"],
});

export function buildOrganizationJsonLd(
  registry: typeof ORGANIZATION_REGISTRY = ORGANIZATION_REGISTRY,
): Record<string, unknown> {
  const clean = (v: string) => String(v ?? "").trim();
  const identifier: Array<Record<string, unknown>> = [];
  if (clean(registry.commercialRegistration)) {
    identifier.push({
      "@type": "PropertyValue",
      propertyID: "السجل التجاري",
      name: "Commercial Registration",
      value: clean(registry.commercialRegistration),
    });
  }
  if (clean(registry.licence)) {
    identifier.push({
      "@type": "PropertyValue",
      propertyID: clean(registry.licenceIssuer) ? `ترخيص ${clean(registry.licenceIssuer)}` : "الترخيص",
      name: "Licence",
      value: clean(registry.licence),
    });
  }
  return {
    "@context": "https://schema.org",
    // Owner decision Q27: an Organization, not a schema.org LegalService.
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "نظامي",
    alternateName: "Nezamy",
    ...(clean(registry.legalName) ? { legalName: clean(registry.legalName) } : {}),
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description: LEGAL_IDENTITY_AR,
    areaServed: "SA",
    knowsLanguage: ["ar", "en"],
    telephone: ORGANIZATION_CONTACT.telephone,
    email: ORGANIZATION_CONTACT.email,
    address: ORGANIZATION_CONTACT.address,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      telephone: ORGANIZATION_CONTACT.telephone,
      email: ORGANIZATION_CONTACT.email,
      availableLanguage: ["ar", "en"],
      areaServed: "SA",
    },
    sameAs: [...ORGANIZATION_CONTACT.sameAs],
    ...(identifier.length ? { identifier } : {}),
  };
}

/* ── /founder: Product + Offer ───────────────────────────────────────────── */

/** Halalas → "2996.00" (Latin digits, two decimals: audit ن5). */
export function sarFromHalalas(h: number): string {
  return (Math.round(h) / 100).toFixed(2);
}

/** "2026-12-18T00:00:00+03:00" (exclusive end) → "2026-12-17", the last day of the offer. */
export function lastDayBefore(exclusiveEndIso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(exclusiveEndIso ?? ""));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The founder membership as schema.org Product with one Offer — Google reads
 * an Offer only inside a supported parent. The price is quote()'s, the same
 * price book checkout charges (2,996 SAR before VAT); null when the founder
 * item is not sold. No `availability`: the sale can be paused («البيع متوقف
 * مؤقتاً») or sold out while this HTML is cached, and InStock would then be a
 * false statement.
 */
export function buildFounderOfferJsonLd(input: {
  description: string;
  endsAtExclusive: string;
}): Record<string, unknown> | null {
  const q = quote(FOUNDER_PLAN_ID, "once");
  if (!q.ok) return null;
  const url = `${SITE_URL}/founder`;
  const price = sarFromHalalas(q.netHalalas);
  const validUntil = lastDayBefore(input.endsAtExclusive);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "باقة المحامي المؤسس",
    description: input.description,
    url,
    brand: { "@type": "Brand", name: "نظامي" },
    offers: {
      "@type": "Offer",
      url,
      price,
      priceCurrency: "SAR",
      ...(validUntil ? { priceValidUntil: validUntil } : {}),
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price,
        priceCurrency: "SAR",
        valueAddedTaxIncluded: false,
      },
      seller: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "نظامي" },
    },
  };
}
