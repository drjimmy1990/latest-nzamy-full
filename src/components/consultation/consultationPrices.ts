/**
 * consultationPrices.ts — the price each /book/consultation type shows (Wave 1
 * task 6, item D).
 *
 * The page used to print «٢٩٩ ر.س» for a voice or video call and «٥٩٩ ر.س»
 * in person, while the client service catalogue says 500 and 700. A booking
 * charges nothing: useConsultationForm writes payment { amount: 0, status:
 * "not_required" } and the team quotes afterwards; the price string travels
 * into the request only as the non-binding estimate (intake.estimatedPrice).
 * So the one source to show is the catalogue the rest of the client side
 * reads — CLIENT_SERVICE_CATALOG merged with admin_pricing_catalog by GET
 * /api/client-pricing (useClientPricingCatalog) — through the same mapping
 * the consultation wizard and the WhatsApp chat use
 * (getConsultationModeServiceId: voice → voice-call, video → video-short,
 * in-person → in-person — owner ٤٣٣, 3 Nov 2026: 129 / 199 / 349 by default).
 * No number is typed here.
 *
 * The AI type has no price (q327, owner package of 1 Nov 2026): «يُحدَّد بعد
 * المراجعة».
 *
 * Pure: relative imports only, so `node --test` loads it.
 */
import type { ClientServiceCatalogItem } from "../../constants/clientServiceCatalog.ts";
import { getConsultationModeServiceId } from "../../lib/pricingRepository.ts";
import { catalogPriceLabel } from "../../lib/pricing/catalogPriceLabel.ts";
import type { ConsultationType, TypeDef } from "./constants.ts";

export const PRICE_AFTER_REVIEW = { ar: "يُحدَّد بعد المراجعة", en: "Set after review" } as const;

/** The catalogue service a booking type is priced by, or null for the AI type. */
export function consultationServiceId(type: ConsultationType): string | null {
  if (type === "ai") return null;
  return getConsultationModeServiceId(type);
}

/** «١٩٩ ر.س» / "199 SAR" from the catalogue, or «يُحدَّد بعد المراجعة». */
export function consultationTypePrice(
  type: ConsultationType,
  catalog: ClientServiceCatalogItem[],
  lang: "ar" | "en",
): string {
  const id = consultationServiceId(type);
  if (!id) return PRICE_AFTER_REVIEW[lang];
  return catalogPriceLabel(id, catalog, lang) ?? PRICE_AFTER_REVIEW[lang];
}

/** One row of the lawyer's «أسعار الاستشارات» panel (owner ٤٣٣). */
export interface LawyerPriceRangeRow {
  serviceId: string;
  /** «صوتية (٢٠ دقيقة)» — the mode and the catalogue's duration. */
  label: string;
  /** The default price clients are shown today, e.g. «١٢٩ ر.س». */
  defaultPrice: string;
  /** «يحدد المحامي سعره بين ٨٩ و٢٤٩ ر.س», or null when the entry has no band. */
  range: string | null;
}

const RANGE_MODES: ReadonlyArray<{ type: Exclude<ConsultationType, "ai"> | "text"; ar: string; en: string }> = [
  { type: "text", ar: "كتابية", en: "Written" },
  { type: "voice", ar: "صوتية (٢٠ دقيقة)", en: "Voice (20 min)" },
  { type: "video", ar: "مرئية (٣٠ دقيقة)", en: "Video (30 min)" },
  { type: "in-person", ar: "حضورية (٤٥ دقيقة)", en: "In person (45 min)" },
];

/**
 * Owner ٤٣٣ (3 Nov 2026): each consultation's default price and the band a
 * lawyer will price it in (catalogue `lawyerPriceRange`). DISPLAY ONLY — no
 * lawyer can set a price yet, so the one screen that shows it (the lawyer's
 * own profile edit) marks it «قريباً». Never shown to clients: it would
 * promise a per-lawyer price nothing charges.
 */
export function lawyerPriceRangeRows(catalog: ClientServiceCatalogItem[], lang: "ar" | "en"): LawyerPriceRangeRow[] {
  return RANGE_MODES.map(({ type, ar, en }) => {
    const serviceId = getConsultationModeServiceId(type);
    const entry = catalog.find((s) => s.serviceId === serviceId);
    const band = entry?.lawyerPriceRange;
    const n = (v: number) => v.toLocaleString(lang === "ar" ? "ar-SA" : "en-US");
    return {
      serviceId,
      label: lang === "ar" ? ar : en,
      defaultPrice: catalogPriceLabel(serviceId, catalog, lang) ?? PRICE_AFTER_REVIEW[lang],
      range: band
        ? lang === "ar"
          ? `يحدد المحامي سعره بين ${n(band.min)} و${n(band.max)} ر.س`
          : `The lawyer sets the price between ${n(band.min)} and ${n(band.max)} SAR`
        : null,
    };
  });
}

/** The type cards with the catalogue's price in place of whatever they carried. */
export function withCatalogPrices(types: TypeDef[], catalog: ClientServiceCatalogItem[], lang: "ar" | "en"): TypeDef[] {
  return types.map((t) => ({ ...t, price: consultationTypePrice(t.id, catalog, lang) }));
}
