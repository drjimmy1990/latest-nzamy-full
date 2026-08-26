export interface LawCategory {
  id: string;     // e.g. "SA-00", "SA-03"
  slug: string;   // matches blog_final folder name, e.g. "sec_03_execution"
  label: string;
  labelEn: string;
  iconName?: string;
}

export const LEGAL_TAXONOMY: LawCategory[] = [
  { id: "SA-00", slug: "sec_00_procedural",     label: "الإجرائي والقضائي",              labelEn: "Procedural & Judicial",              iconName: "Gavel" },
  { id: "SA-01", slug: "sec_01_criminal",       label: "الجنائي والعقوبات",              labelEn: "Criminal & Penal",                   iconName: "ShieldCheck" },
  { id: "SA-02", slug: "sec_02_admin",          label: "الإداري والخدمة المدنية",        labelEn: "Administrative & Civil Service",      iconName: "Bank" },
  { id: "SA-03", slug: "sec_03_civil",          label: "المدني والأحوال الشخصية",        labelEn: "Civil & Personal Status",            iconName: "Users" },
  { id: "SA-04", slug: "sec_04_commercial",     label: "التجاري والشركات",               labelEn: "Commercial & Corporate",             iconName: "Buildings" },
  { id: "SA-05", slug: "sec_05_ip",             label: "الملكية الفكرية",                labelEn: "Intellectual Property",              iconName: "Lightbulb" },
  { id: "SA-06", slug: "sec_06_labor",          label: "العمل والتأمينات",               labelEn: "Labor & Social Insurance",           iconName: "Briefcase" },
  { id: "SA-07", slug: "sec_07_real_estate",    label: "العقاري والبناء والمقاولات",     labelEn: "Real Estate, Construction & Contracting", iconName: "House" },
  { id: "SA-08", slug: "sec_08_financial",      label: "المالي والمصرفي",                labelEn: "Financial & Banking",                iconName: "CurrencyCircleDollar" },
  { id: "SA-09", slug: "sec_09_tax",            label: "الضريبي والزكوي والجمركي",       labelEn: "Tax, Zakat & Customs",               iconName: "Calculator" },
  { id: "SA-10", slug: "sec_10_health",         label: "الصحي والدوائي",                 labelEn: "Health & Pharmaceutical",            iconName: "FirstAid" },
  { id: "SA-11", slug: "sec_11_environment",    label: "البيئة والمياه",                 labelEn: "Environment & Water",                iconName: "Plant" },
  { id: "SA-12", slug: "sec_12_tech",           label: "التقنية والاتصالات والفضاء",     labelEn: "Technology, Telecom & Space",        iconName: "GlobeHemisphereWest" },
  { id: "SA-13", slug: "sec_13_transport",      label: "النقل والخدمات اللوجستية",       labelEn: "Transport & Logistics",              iconName: "Truck" },
  { id: "SA-14", slug: "sec_14_energy",         label: "الطاقة",                         labelEn: "Energy",                             iconName: "Lightning" },
  { id: "SA-15", slug: "sec_15_media",          label: "الإعلام والنشر",                 labelEn: "Media & Publishing",                 iconName: "Megaphone" },
  { id: "SA-16", slug: "sec_16_industry",       label: "الصناعة والتعدين",               labelEn: "Industry & Mining",                  iconName: "Factory" },
  { id: "SA-17", slug: "sec_17_constitutional", label: "الدستوري والسيادي",              labelEn: "Constitutional & Sovereign",         iconName: "Scroll" },
  { id: "SA-18", slug: "sec_18_food",           label: "الغذائي والزراعي والحيواني",     labelEn: "Food, Agriculture & Livestock",      iconName: "Plant" },
  { id: "SA-19", slug: "sec_19_investment",     label: "الاستثمار والتخصيص",             labelEn: "Investment & Privatization",         iconName: "TrendUp" },
  { id: "SA-20", slug: "sec_20_education",      label: "التعليم والتدريب",               labelEn: "Education & Training",               iconName: "GraduationCap" },
  { id: "SA-21", slug: "sec_21_sports",         label: "الرياضة والشباب",                labelEn: "Sports & Youth",                     iconName: "PersonSimpleRun" },
  { id: "SA-22", slug: "sec_22_hajj",           label: "الحج والعمرة",                   labelEn: "Hajj & Umrah",                       iconName: "Mosque" },
  { id: "SA-23", slug: "sec_23_defense",        label: "الدفاع والأمن الوطني",           labelEn: "Defense & National Security",        iconName: "ShieldStar" },
  { id: "SA-24", slug: "sec_24_social",         label: "الاجتماعي والأوقاف",             labelEn: "Social & Endowments",                iconName: "HandHeart" },
  { id: "SA-25", slug: "sec_25_tourism",        label: "السياحة والضيافة",               labelEn: "Tourism & Hospitality",              iconName: "AirplaneTilt" },
  { id: "SA-26", slug: "sec_26_municipal",      label: "الشؤون البلدية والتخطيط الحضري", labelEn: "Municipal Affairs & Urban Planning",  iconName: "City" },
  { id: "SA-27", slug: "sec_27_culture",        label: "الثقافة والترفيه",               labelEn: "Culture & Entertainment",            iconName: "Star" },
  { id: "SA-28", slug: "sec_28_arbitration",    label: "التحكيم وتسوية النزاعات",        labelEn: "Arbitration & Dispute Resolution",   iconName: "HandshakeSimple" },
  { id: "SA-29", slug: "sec_29_international",  label: "العلاقات الدولية والاتفاقيات",   labelEn: "International Relations & Treaties", iconName: "Globe" },
  { id: "SA-99", slug: "sec_99_principles",     label: "المبادئ القضائية والتطبيقات",    labelEn: "Judicial Principles & Precedents",   iconName: "Scales" },
];

export function getCategoryById(id: string): LawCategory | undefined {
  return LEGAL_TAXONOMY.find((c) => c.id === id);
}

export function getCategoryBySlug(slug: string): LawCategory | undefined {
  return LEGAL_TAXONOMY.find((c) => c.slug === slug);
}


// ─── One taxonomy — owner item ١٦ ────────────────────────────────────────────
//
// His ruling on س٥ was «الـ٣١ اللي في الكود»: LEGAL_TAXONOMY above is the
// platform's specialisation vocabulary, and everything else defers to it.
//
// It did not, until now. Five separate lists described the same idea with
// mutually incompatible ids — `real-estate` here, `real_estate` there, and the
// raw Arabic string «عقاري» as an id in a third — and at least one of them
// (dashboard/client/find-lawyer) WRITES its id into `metadata.specialty` on a
// real request. So the database already holds three spellings of one
// specialisation and nothing can group them.
//
// The fix is not to delete the old ids: rows carrying them exist and a picker
// that no longer recognises its own stored values shows the client a blank
// field. This maps every legacy spelling onto its canonical `SA-xx`, so old
// data resolves and new data is written canonically. Exactly the precedent set
// by keeping `letterType: "complaint"` in intakeValues.ts after that tile was
// retired from the picker.
//
// Deliberately INCOMPLETE where the answer is a guess. «العقود والاتفاقيات» and
// «الامتثال التنظيمي» sit across more than one category, and filing them under
// a wrong SA-xx would be worse than leaving them unmapped — an unmapped value
// falls back to displaying itself, which is honest. Add them when someone who
// knows decides.
const CATEGORY_ALIASES: Record<string, string> = {
  // SA-00 — الإجرائي والقضائي
  enforcement: "SA-00", "تنفيذ": "SA-00", "التنفيذ": "SA-00",
  // SA-01 — الجنائي والعقوبات
  criminal: "SA-01", "جنائي": "SA-01", "جزائي": "SA-01",
  "قضايا جنائية": "SA-01", "القانون الجنائي": "SA-01",
  // SA-02 — الإداري والخدمة المدنية
  admin: "SA-02", administrative: "SA-02", "إداري": "SA-02",
  "قضايا إدارية": "SA-02", "القانون الإداري": "SA-02",
  // SA-03 — المدني والأحوال الشخصية
  civil: "SA-03", family: "SA-03", "مدني": "SA-03",
  "أحوال شخصية": "SA-03", "الأحوال الشخصية": "SA-03",
  "قانون الأسرة": "SA-03", "المنازعات المدنية": "SA-03", "أسرة": "SA-03",
  // SA-04 — التجاري والشركات
  commercial: "SA-04", corporate: "SA-04", "تجاري": "SA-04", "شركات": "SA-04",
  "قضايا تجارية": "SA-04", "تجاري وشركات": "SA-04", "القانون التجاري": "SA-04",
  // SA-05 — الملكية الفكرية
  ip: "SA-05", "ملكية فكرية": "SA-05", "الملكية الفكرية": "SA-05",
  // SA-06 — العمل والتأمينات
  labor: "SA-06", labour: "SA-06", "عمالي": "SA-06",
  "قضايا عمالية": "SA-06", "قضايا العمل": "SA-06",
  // SA-07 — العقاري والبناء والمقاولات
  "real-estate": "SA-07", real_estate: "SA-07", realestate: "SA-07",
  "عقاري": "SA-07", "عقارات": "SA-07", "القضايا العقارية": "SA-07",
  // SA-08 — المالي والمصرفي
  banking: "SA-08", finance: "SA-08", "بنكي/مالي": "SA-08", "مالي": "SA-08",
  // SA-28 — التحكيم وتسوية النزاعات
  arbitration: "SA-28", "تحكيم": "SA-28",
  "التحكيم الدولي": "SA-28", "التحكيم التجاري": "SA-28",
};

/**
 * The canonical `SA-xx` for anything a picker or an old row might carry, or
 * null when nothing in the vocabulary matches.
 *
 * Null is a real answer, not a failure: `all` (the "no filter" option every
 * picker carries) has no category and must not be coerced into one, and an
 * unrecognised legacy value is better shown as itself than filed under a guess.
 */
export function normalizeCategoryId(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  // Already canonical — accept any case so `sa-06` from a URL resolves.
  const upper = value.toUpperCase();
  if (LEGAL_TAXONOMY.some((c) => c.id === upper)) return upper;
  // A slug (`sec_06_labor`) is canonical too — the library and the blog use
  // slugs where the pickers use ids.
  const bySlug = LEGAL_TAXONOMY.find((c) => c.slug === value.toLowerCase());
  if (bySlug) return bySlug.id;
  return CATEGORY_ALIASES[value] ?? CATEGORY_ALIASES[value.toLowerCase()] ?? null;
}

/**
 * The Arabic label to show for any stored specialisation value.
 *
 * Falls back to the raw value rather than to «—» or to an English id: the same
 * rule intakeValues.ts follows, and for the same reason — a fulfilment team
 * reading «real_estate» on an order summary is the failure this prevents.
 */
export function categoryLabelFor(raw: string | null | undefined): string {
  const id = normalizeCategoryId(raw);
  if (id) return LEGAL_TAXONOMY.find((c) => c.id === id)?.label ?? id;
  return typeof raw === "string" ? raw.trim() : "";
}
