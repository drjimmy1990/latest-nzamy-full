import React from "react";

export type AudienceTab = "individuals" | "companies" | "lawyers" | "firms" | "micro" | "ngo" | "government" | "providers";
export type Billing     = "monthly" | "yearly";
export type CompanySize = "small" | "medium" | "large";

export interface PlanFeatures { ai: (string | null)[]; platform: (string | null)[]; support: (string | null)[]; }

export interface Plan {
  id: string; name: string; badge: string | null;
  priceMonthly: string; priceYearly: string;
  periodMonthly: string; periodYearly: string;
  desc: string; target: string; cta: string; ctaHref: string;
  highlighted: boolean; color: string;
  bonusLabel?: string; // e.g. "+١٠٠٪ نقاط مجانية" — shown as prominent pill
  isBetaHidden?: boolean;
  includedSeats?: number;
  extraSeatPrice?: string;
  minimumSeats?: number;
  maxSeats?: number | null;
  includedAnnualPoints?: number;
  pricingFormulaLabel?: string;
  companySize?: CompanySize | CompanySize[];
  forLegalDept?: boolean;
  /** Commission percentage for InDrive-style provider plans */
  commissionPct?: number;
  features: PlanFeatures;
}

export interface ComparisonRow { feature: string; [planId: string]: boolean | string | undefined; }

export interface ComparisonCategory { category: string; icon: React.ElementType; rows: ComparisonRow[]; }

export interface FaqItem { q: string; a: string; }

export interface PayPerUseItem {
  id: string;
  labelAr: string; labelEn: string;
  priceAr: string; priceEn: string;
  noteAr: string; noteEn: string;
  icon: React.ElementType;
  free?: boolean;
}

/** Billing info callout shown per audience tab */
export interface BillingNote {
  icon: string;
  textAr: string;
  textEn: string;
}
