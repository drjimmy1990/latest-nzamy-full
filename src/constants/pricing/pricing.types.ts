import React from "react";
import type { Cycle } from "../../lib/pricing/priceBook";

export type AudienceTab = "individuals" | "companies" | "lawyers" | "firms" | "micro" | "ngo" | "government" | "providers";
/** The /pricing cycle toggle: monthly / quarterly / semiannual / yearly (src/lib/pricing/priceBook.ts). */
export type Billing     = Cycle;
export type CompanySize = "small" | "medium" | "large";

export interface PlanFeatures { ai: (string | null)[]; platform: (string | null)[]; support: (string | null)[]; }

export interface Plan {
  id: string; name: string; badge: string | null;
  /**
   * Display prices of a card the price book does NOT sell online (biz-*,
   * providers, the firm library…). A card whose id is a price-book entry
   * carries no price here: the card reads it from the book by id and cycle
   * (src/lib/pricing/cardPrice.ts), so a page can never show a price
   * checkout does not charge.
   */
  priceMonthly?: string; priceYearly?: string;
  periodMonthly: string; periodYearly: string;
  /** Period text for the quarterly / half-yearly cycles; «ر.س / ٣ أشهر» / «ر.س / ٦ أشهر» when unset. */
  periodQuarterly?: string; periodSemiannual?: string;
  desc: string; target: string; cta: string; ctaHref: string;
  bonusLabel?: string; // e.g. "+١٠٠٪ نقاط مجانية" — shown as prominent pill
  priceOriginal?: string;
  isBetaHidden?: boolean;
  /**
   * Shown but not sold yet (owner ٤٢٠: «عضوية الحماية القانونية»): the card
   * carries a «قريباً» badge, no price and a disabled «قريباً» button instead
   * of subscribe. Its id is NOT a price-book entry (the book's own
   * `comingSoon` hides a card entirely) and its ctaHref is no signup link, so
   * no `?plan=` resolves to it (planRequest.ts).
   */
  comingSoon?: boolean;
  /**
   * Sold today, but some of the listed features are not built yet (owner
   * ٤٣٧): a small «بعض المزايا قريباً» badge; those feature lines say «قريباً».
   */
  someFeaturesSoon?: boolean;
  includedSeats?: number;
  extraSeatPrice?: string;
  minimumSeats?: number;
  maxSeats?: number | null;
  includedAnnualPoints?: number;
  pricingFormulaLabel?: string;
  /**
   * A line under the features that links to sales instead of quoting a price
   * (owner answer ٢١٧: «مقاعد إضافية: تواصل مع المبيعات»).
   */
  salesLine?: { label: string; href: string };
  /** Small grey line under the card (owner answer ٢١٣: «* تطبق الشروط والأحكام»). */
  footnote?: string;
  companySize?: CompanySize | CompanySize[];
  forLegalDept?: boolean;
  /** Commission percentage for InDrive-style provider plans */
  commissionPct?: number;
  highlighted?: boolean;
  color?: string;
  features: PlanFeatures;
}

export interface ComparisonRow { feature: string; [planId: string]: boolean | string | undefined; }

export interface ComparisonCategory { category: string; icon: React.ElementType; rows: ComparisonRow[]; }

export interface FaqItem { q: string; a: string; }

/** Billing info callout shown per audience tab */
export interface BillingNote {
  icon: string;
  textAr: string;
  textEn: string;
}
