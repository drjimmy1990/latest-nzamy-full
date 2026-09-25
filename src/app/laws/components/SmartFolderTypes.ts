export interface LawRef {
  slug: string;
  title: string;
  titleEn: string;
  catId: string;
  type?: "law" | "order" | "precedent" | "book";
}

export interface SmartFolder {
  id: string;
  name: string;
  nameEn: string;
  color: string;
  icon: "default" | "star" | "pin" | "book";
  isDefault: boolean;
  laws: LawRef[];
  isPinned?: boolean;
  lastModified?: number;
}

export interface LibraryDoc {
  slug: string;
  title: string;
  titleEn: string;
  catId: string;
  type: "law" | "order" | "precedent" | "book";
}

export const FOLDER_COLORS = [
  { id: "emerald",  hex: "#10b981", label: "أخضر",  labelEn: "Emerald" },
  { id: "sky",      hex: "#0ea5e9", label: "أزرق",  labelEn: "Sky" },
  { id: "amber",    hex: "#f59e0b", label: "ذهبي",  labelEn: "Amber" },
  { id: "rose",     hex: "#f43f5e", label: "وردي",  labelEn: "Rose" },
  { id: "violet",   hex: "#8b5cf6", label: "بنفسجي", labelEn: "Violet" },
  { id: "slate",    hex: "#64748b", label: "رمادي",  labelEn: "Slate" },
  { id: "orange",   hex: "#f97316", label: "برتقالي", labelEn: "Orange" },
  { id: "teal",     hex: "#14b8a6", label: "تركواز", labelEn: "Teal" },
];

// Slugs below were re-pointed 2026-09-25 (LIB-04 pass) from the old-corpus
// literal names to the real self-hosted slugs, verified against
// auth.nezamy.sa REST. "civil-procedure" is left as-is: /laws/civil-procedure
// is its own 308 redirect (LIB-12) to sharia-pleading-law-qadha-edition.
export const DEFAULT_LAWS: LawRef[] = [
  { slug: "civil-procedure",             title: "نظام المرافعات الشرعية",     titleEn: "Civil Procedure Law",      catId: "SA-00", type: "law" },
  { slug: "evidence-law-qadha-edition",  title: "نظام الإثبات",               titleEn: "Evidence Law",             catId: "SA-00", type: "law" },
  { slug: "execution-law-qadha-edition", title: "نظام التنفيذ",               titleEn: "Execution Law",            catId: "SA-00", type: "law" },
  { slug: "civil-transactions-law",      title: "نظام المعاملات المدنية",     titleEn: "Civil Transactions Law",   catId: "SA-03", type: "law" },
  { slug: "labor-law-qadha",             title: "نظام العمل",                 titleEn: "Labor Law",                catId: "SA-06", type: "law" },
  { slug: "companies-law",               title: "نظام الشركات",               titleEn: "Companies Law",            catId: "SA-04", type: "law" },
  { slug: "commercial-courts-law",       title: "نظام المحاكم التجارية",      titleEn: "Commercial Courts Law",    catId: "SA-04", type: "law" },
  { slug: "personal-status-law",         title: "نظام الأحوال الشخصية",       titleEn: "Personal Status Law",      catId: "SA-03", type: "law" },
];

export const DEMO_FOLDERS: SmartFolder[] = [
  {
    id: "default-daily",
    name: "الأنظمة الأساسية",
    nameEn: "Core Daily Laws",
    color: "#0B3D2E",
    icon: "star",
    isDefault: true,
    laws: DEFAULT_LAWS,
    lastModified: Date.now()
  },
  {
    id: "folder-real-estate",
    name: "العقارات والإيجار",
    nameEn: "Real Estate & Leasing",
    color: "#0ea5e9",
    icon: "book",
    isDefault: false,
    laws: [
      { slug: "real-estate-brokerage-law",       title: "نظام الوساطة العقارية", titleEn: "Real Estate Brokerage Law", catId: "SA-07", type: "law" },
      // registered-lease (نظام إيجار / "Ejar Law", 2026-09-25): removed — no
      // standalone "نظام إيجار" system exists on self-hosted; Ejar is run
      // through ministerial decisions/circulars, not its own نظام, so there is
      // no confident real-slug match to point this at instead of a 404.
      { slug: "real-estate-title-registration-law", title: "نظام التسجيل العيني للعقار", titleEn: "Real Estate Registry Law", catId: "SA-07", type: "law" },
    ],
    lastModified: Date.now()
  },
  {
    id: "folder-arbitration",
    name: "التحكيم والمنازعات",
    nameEn: "Arbitration & Disputes",
    color: "#8b5cf6",
    icon: "pin",
    isDefault: false,
    laws: [
      { slug: "arbitration-law",                title: "نظام التحكيم",                 titleEn: "Arbitration Law",          catId: "SA-28", type: "law" },
      { slug: "grievance-board-enforcement-law", title: "نظام التنفيذ أمام ديوان المظالم", titleEn: "BOG Enforcement Law",    catId: "SA-28", type: "law" },
    ],
    lastModified: Date.now()
  },
];

export const ALL_LIBRARY_DOCS: LibraryDoc[] = [
  { slug: "companies-law", title: "نظام الشركات", titleEn: "Companies Law", catId: "SA-04", type: "law" },
  { slug: "commercial-courts-law", title: "نظام المحاكم التجارية", titleEn: "Commercial Courts Law", catId: "SA-04", type: "law" },
  { slug: "civil-procedure", title: "نظام المرافعات الشرعية", titleEn: "Civil Procedure Law", catId: "SA-00", type: "law" },
  { slug: "evidence-law-qadha-edition", title: "نظام الإثبات", titleEn: "Evidence Law", catId: "SA-00", type: "law" },
  { slug: "execution-law-qadha-edition", title: "نظام التنفيذ", titleEn: "Execution Law", catId: "SA-00", type: "law" },
  { slug: "civil-transactions-law", title: "نظام المعاملات المدنية", titleEn: "Civil Transactions Law", catId: "SA-03", type: "law" },
  { slug: "labor-law-qadha", title: "نظام العمل", titleEn: "Labor Law", catId: "SA-06", type: "law" },
  { slug: "personal-status-law", title: "نظام الأحوال الشخصية", titleEn: "Personal Status Law", catId: "SA-03", type: "law" },
  { slug: "real-estate-brokerage-law", title: "نظام الوساطة العقارية", titleEn: "Real Estate Brokerage Law", catId: "SA-07", type: "law" },
  // registered-lease (Ejar Law) removed — see DEMO_FOLDERS note above; no
  // confident self-hosted match.
  { slug: "real-estate-title-registration-law", title: "نظام التسجيل العيني للعقار", titleEn: "Real Estate Registry Law", catId: "SA-07", type: "law" },
  { slug: "arbitration-law", title: "نظام التحكيم", titleEn: "Arbitration Law", catId: "SA-28", type: "law" },
  { slug: "grievance-board-enforcement-law", title: "نظام التنفيذ أمام ديوان المظالم", titleEn: "BOG Enforcement Law", catId: "SA-28", type: "law" },
  // Non-law entries resolved 2026-09-25 against self-hosted (auth.nezamy.sa).
  // Books use feqh_books.id, the key /api/library/books/[slug] reads; the two
  // old demo ids (rawd-al-murbi, sources-of-right-1) exist in no table.
  { slug: "الروض المربع شرح زاد المستقنع", title: "الروض المربع شرح زاد المستقنع", titleEn: "Al-Rawd Al-Murbi", catId: "SA-00", type: "book" },
  { slug: "مصادر الحق في الفقه الإسلامي - الجزء الأول", title: "مصادر الحق في الفقه الإسلامي — الجزء 1", titleEn: "Sources of Right, vol. 1", catId: "SA-00", type: "book" },
  // Removed, no confident match: the eight demo orders (ord-sama-01,
  // ord-ncnp-01, ord-01..ord-06) — decrees_circulars.id is a uuid, and no row
  // matches their titles (the companies-law and VAT approval decrees, the SAMA
  // e-payment, NCNP donation, domestic-labour, REGA ads and e-commerce
  // circulars are not in the table); and the seven demo precedents
  // (prec-moj-01, prec-01..prec-06), which name topics, not
  // judicial_collections rows. Each linked to a not-found or unavailable page.
];
