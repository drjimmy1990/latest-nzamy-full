export type PhosphorIcon = React.ElementType; // Use ElementType for the icon components

export type TrackingStep = {
  ar: string;
  en: string;
  status: "done" | "active" | "pending";
  time_ar: string;
  time_en: string;
};

export interface ServiceCard {
  icon: PhosphorIcon;
  ar: string;
  en: string;
  desc_ar: string;
  desc_en: string;
  color: string;
  bg: string;
}

export interface GovEntity {
  ar: string;
  en: string;
  short: string;
}

export interface PricingTier {
  name_ar: string;
  name_en: string;
  price: string;
  price_num: string;
  currency: string;
  period_ar: string;
  period_en: string;
  features_ar: string[];
  features_en: string[];
  highlight: boolean;
  color: string;
  btnClass: string;
}

export interface FAQ {
  q_ar: string;
  q_en: string;
  a_ar: string;
  a_en: string;
}
