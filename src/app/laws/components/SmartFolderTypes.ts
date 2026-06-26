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

export const DEFAULT_LAWS: LawRef[] = [
  { slug: "civil-procedure",     title: "نظام المرافعات الشرعية",     titleEn: "Civil Procedure Law",      catId: "SA-00", type: "law" },
  { slug: "evidence-law",        title: "نظام الإثبات",               titleEn: "Evidence Law",             catId: "SA-00", type: "law" },
  { slug: "execution-law",       title: "نظام التنفيذ",               titleEn: "Execution Law",            catId: "SA-00", type: "law" },
  { slug: "civil-transactions",  title: "نظام المعاملات المدنية",     titleEn: "Civil Transactions Law",   catId: "SA-03", type: "law" },
  { slug: "labor-law",           title: "نظام العمل",                 titleEn: "Labor Law",                catId: "SA-06", type: "law" },
  { slug: "companies-law",       title: "نظام الشركات",               titleEn: "Companies Law",            catId: "SA-04", type: "law" },
  { slug: "commercial-court",    title: "نظام المحاكم التجارية",      titleEn: "Commercial Courts Law",    catId: "SA-04", type: "law" },
  { slug: "personal-status",     title: "نظام الأحوال الشخصية",       titleEn: "Personal Status Law",      catId: "SA-03", type: "law" },
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
      { slug: "real-estate-brokerage", title: "نظام الوساطة العقارية", titleEn: "Real Estate Brokerage Law", catId: "SA-07", type: "law" },
      { slug: "registered-lease",      title: "نظام إيجار",             titleEn: "Ejar Law",                 catId: "SA-07", type: "law" },
      { slug: "real-estate-registry",  title: "نظام التسجيل العيني للعقار", titleEn: "Real Estate Registry Law", catId: "SA-07", type: "law" },
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
      { slug: "arbitration-law",  title: "نظام التحكيم",                 titleEn: "Arbitration Law",          catId: "SA-28", type: "law" },
      { slug: "enforcement-law",  title: "نظام التنفيذ أمام ديوان المظالم", titleEn: "BOG Enforcement Law",    catId: "SA-28", type: "law" },
    ],
    lastModified: Date.now()
  },
];

export const ALL_LIBRARY_DOCS: LibraryDoc[] = [
  { slug: "companies-law", title: "نظام الشركات", titleEn: "Companies Law", catId: "SA-04", type: "law" },
  { slug: "commercial-court", title: "نظام المحاكم التجارية", titleEn: "Commercial Courts Law", catId: "SA-04", type: "law" },
  { slug: "civil-procedure", title: "نظام المرافعات الشرعية", titleEn: "Civil Procedure Law", catId: "SA-00", type: "law" },
  { slug: "evidence-law", title: "نظام الإثبات", titleEn: "Evidence Law", catId: "SA-00", type: "law" },
  { slug: "execution-law", title: "نظام التنفيذ", titleEn: "Execution Law", catId: "SA-00", type: "law" },
  { slug: "civil-transactions", title: "نظام المعاملات المدنية", titleEn: "Civil Transactions Law", catId: "SA-03", type: "law" },
  { slug: "labor-law", title: "نظام العمل", titleEn: "Labor Law", catId: "SA-06", type: "law" },
  { slug: "personal-status", title: "نظام الأحوال الشخصية", titleEn: "Personal Status Law", catId: "SA-03", type: "law" },
  { slug: "real-estate-brokerage", title: "نظام الوساطة العقارية", titleEn: "Real Estate Brokerage Law", catId: "SA-07", type: "law" },
  { slug: "registered-lease", title: "نظام إيجار", titleEn: "Ejar Law", catId: "SA-07", type: "law" },
  { slug: "real-estate-registry", title: "نظام التسجيل العيني للعقار", titleEn: "Real Estate Registry Law", catId: "SA-07", type: "law" },
  { slug: "arbitration-law", title: "نظام التحكيم", titleEn: "Arbitration Law", catId: "SA-28", type: "law" },
  { slug: "enforcement-law", title: "نظام التنفيذ أمام ديوان المظالم", titleEn: "BOG Enforcement Law", catId: "SA-28", type: "law" },
  { slug: "rawd-al-murbi", title: "الروض المربع بشرح زاد المستقنع", titleEn: "Al-Rawd Al-Murbi", catId: "SA-00", type: "book" },
  { slug: "sources-of-right-1", title: "مصادر الحق في الفقه الإسلامي", titleEn: "Sources of Right", catId: "SA-00", type: "book" },
  { slug: "ord-sama-01", title: "تعميم البنك المركزي بشأن الجاهزية للمدفوعات الإلكترونية", titleEn: "SAMA e-Payment circular", catId: "SA-08", type: "order" },
  { slug: "ord-ncnp-01", title: "تعميم المركز الوطني لتنمية القطاع غير الربحي بشأن حملات التبرع", titleEn: "NCNP Ramadan charity circular", catId: "SA-10", type: "order" },
  { slug: "ord-01", title: "الموافقة على نظام الشركات المحدث", titleEn: "Royal Decree for Companies Law", catId: "SA-04", type: "order" },
  { slug: "ord-02", title: "الموافقة على نظام ضريبة القيمة المضافة", titleEn: "Cabinet Order for VAT Law", catId: "SA-09", type: "order" },
  { slug: "ord-03", title: "تعميم بشأن ضوابط إنهاء عقود العمالة المنزلية", titleEn: "MOL Circular for Domestic Labor", catId: "SA-06", type: "order" },
  { slug: "ord-04", title: "نظام حماية البيانات الشخصية", titleEn: "Personal Data Protection Law", catId: "SA-12", type: "order" },
  { slug: "ord-05", title: "تعميم بشأن ضوابط الإعلانات العقارية الإلكترونية", titleEn: "REGA Circular for Real Estate Ads", catId: "SA-07", type: "order" },
  { slug: "ord-06", title: "قرار بشأن ضوابط منصات التجارة الإلكترونية", titleEn: "Cabinet Order for E-commerce Platforms", catId: "SA-04", type: "order" },
  { slug: "prec-moj-01", title: "عدم قبول طلب النقض لعدم التأسيس على محال الاعتراض (المادة 88 من نظام المحاكم التجارية)", titleEn: "Supreme Court Commercial Judgment - Art 88", catId: "SA-04", type: "precedent" },
  { slug: "prec-01", title: "عقد التوريد والخدمات اللوجستية", titleEn: "Commercial precedent 1", catId: "SA-04", type: "precedent" },
  { slug: "prec-02", title: "صورية العقود والشركات", titleEn: "Commercial precedent 2", catId: "SA-04", type: "precedent" },
  { slug: "prec-03", title: "الفصل التعسفي والتعويض عنه", titleEn: "Labor precedent 1", catId: "SA-06", type: "precedent" },
  { slug: "prec-04", title: "جرائم المعلوماتية والابتزاز", titleEn: "Criminal precedent 1", catId: "SA-01", type: "precedent" },
  { slug: "prec-05", title: "القرار الإداري الفردي", titleEn: "Administrative precedent 1", catId: "SA-02", type: "precedent" },
  { slug: "prec-06", title: "الملكية العقارية والتسجيل العيني", titleEn: "Real Estate precedent 1", catId: "SA-07", type: "precedent" }
];
