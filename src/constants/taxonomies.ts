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

