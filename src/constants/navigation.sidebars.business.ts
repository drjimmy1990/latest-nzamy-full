import type { SidebarGroup } from "./navigation.types";

// ── Corporate Sidebar (شركة) ──────────────────────────────────────────────────
export const CORPORATE_SIDEBAR: SidebarGroup[] = [
  {
    items: [
      { label: "نظرة عامة",     labelEn: "Overview",     href: "/dashboard/business",                      icon: "SquaresFour" },
      { label: "إدارة القضايا",  labelEn: "All Cases",    href: "/dashboard/business/cases",               icon: "Gavel", gateKey: "business-litigation" },
      { label: "الدوائر والإيميلات", labelEn: "Circuits & Emails", href: "/dashboard/business/circuits-emails", icon: "Envelope", gateKey: "business-litigation" },
      { label: "الأقسام",        labelEn: "Departments",  href: "/dashboard/business/departments",          icon: "Buildings", gateKey: "departments" },
      { label: "إدارة الفريق",   labelEn: "Team",         href: "/dashboard/business/team",                icon: "Users", gateKey: "team-manage" },
      { label: "لوحة المهام",    labelEn: "Kanban",       href: "/dashboard/business/kanban",              icon: "Kanban", gateKey: "kanban" },
      { label: "عقود الموظفين",  labelEn: "HR Contracts", href: "/dashboard/business/employee-contracts", icon: "FileText", gateKey: "hr-contracts" },
      { label: "التقارير",       labelEn: "Reports",      href: "/dashboard/business/reports",             icon: "ChartBar", gateKey: "reports" },
      { label: "باقتنا",         labelEn: "Our Plan",     href: "/dashboard/business/wallet",              icon: "Crown", gateKey: "finance" },
    ],
  },
  {
    title: "أدوات AI للشركات", titleEn: "Corporate AI Tools",
    collapsible: true,
    defaultOpen: true,
    items: [
      { label: "صائغ العقود",            labelEn: "Contract Drafter",    href: "/ai/corp/contracts",           icon: "FileText", badge: "جديد" },
      { label: "محلل الصفقات والفرص",   labelEn: "Deal Intelligence",   href: "/ai/corp/deal-intel",          icon: "Briefcase",    badge: "جديد", gateKey: "ai-corp" },
      { label: "المستشار التجاري",      labelEn: "Corp Advisor",        href: "/ai/corp/advisor",             icon: "Buildings", gateKey: "ai-corp" },
      { label: "مراقب الامتثال",        labelEn: "Compliance",          href: "/ai/corp/compliance-monitor",  icon: "ShieldCheck", gateKey: "ai-corp" },
      { label: "تحليل مخاطر الأطراف",   labelEn: "Risk Assessment",     href: "/ai/corp/risk-assessment",     icon: "ShieldWarning", gateKey: "ai-corp" },
      { label: "التحصيل القانوني",      labelEn: "Debt Collection",     href: "/ai/debt-collection",          icon: "Money" },
      { label: "LegalMail",             labelEn: "LegalMail",           href: "/ai/mail-advisor",             icon: "Envelope",     badge: "جديد" },
      { label: "مستشار الموارد البشرية",labelEn: "HR Advisor",         href: "/ai/corp/hr",                  icon: "Users", gateKey: "hr-contracts" },
      { label: "CorpMind وكيل الشركة",  labelEn: "CorpMind",            href: "/ai/corp/corpmind",            icon: "Robot",        badge: "مُحسّن", gateKey: "ai-corp" },
      { label: "راصد التشريعات",        labelEn: "Law Monitor",         href: "/ai/monitor",                  icon: "Bell" },
      { label: "فاحص المستندات",        labelEn: "Doc Analyzer",        href: "/ai/analyze?source=business",                  icon: "Scan",         badge: "للمستشار" },
    ],
  },
  {
    title: "الحوكمة والمراجعات", titleEn: "Governance & Reviews",
    items: [
      { label: "الفحص القانوني ٣٦٠°", labelEn: "Health Check 360°",  href: "/dashboard/business/health-check",     icon: "MagnifyingGlass", badge: "جديد",   gateKey: "health-check" },
      { label: "الحوكمة المؤسسية",   labelEn: "Governance",         href: "/dashboard/business/governance",            icon: "ShieldCheck", badge: "جديد",        gateKey: "governance" },
      { label: "الموافقات والقواعد",  labelEn: "Governance Matrix",  href: "/dashboard/business/governance?tab=matrix",  icon: "ListChecks",                       gateKey: "governance" },
      { label: "إرسال للمراجعة",      labelEn: "New Review",         href: "/dashboard/business/reviews/new",      icon: "FileArrowUp", gateKey: "dept-reviews" },
      { label: "مراجعات الإدارات",    labelEn: "Dept Reviews",       href: "/dashboard/business/reviews",          icon: "ClipboardText", gateKey: "dept-reviews" },
      { label: "المستشار المنتدب",    labelEn: "Seconded Counsel",   href: "/dashboard/business/seconded-counsel", icon: "UserCircle", badge: "جديد", gateKey: "seconded-counsel" },
    ],
  },
  {
    title: "سوق المهنيين", titleEn: "Marketplace",
    items: [
      { label: "طلباتي في السوق",  labelEn: "My Requests",   href: "/dashboard/business/marketplace",  icon: "Storefront", badge: "جديد", gateKey: "marketplace" },
      { label: "تصفح السوق",       labelEn: "Browse Market", href: "/marketplace",                      icon: "MagnifyingGlass", gateKey: "marketplace" },
      { label: "انشر طلباً",       labelEn: "Post Request",  href: "/marketplace/post",                 icon: "PencilSimple", gateKey: "marketplace" },
    ],
  },
  {
    items: [
      { label: "المدونة القانونية", labelEn: "Legal Blog", href: "/blog", icon: "Article", divider: true },
      { label: "الإشعارات", labelEn: "Notifications", href: "/notifications", icon: "Bell" },
      { label: "الإعدادات",  labelEn: "Settings",      href: "/settings",      icon: "GearSix" },
    ],
  },
];

// ── Micro Sidebar (منشأة صغيرة) ───────────────────────────────────────────────
export const MICRO_SIDEBAR: SidebarGroup[] = [
  {
    items: [
      { label: "لوحة التحكم", labelEn: "Dashboard", href: "/dashboard/micro", icon: "SquaresFour" },
    ],
  },
  {
    title: "اشتراطات نشاطي", titleEn: "Business Requirements",
    items: [
      { label: "اشتراطات البلدية",   labelEn: "Municipality",  href: "/dashboard/micro/requirements/municipality", icon: "Buildings", gateKey: "micro-requirements" },
      { label: "الزكاة والضريبة",   labelEn: "Zakat & Tax",   href: "/dashboard/micro/requirements/zakat",        icon: "Percent", gateKey: "micro-requirements" },
      { label: "التأمينات الاجتماعية",labelEn: "GOSI",         href: "/dashboard/micro/requirements/gosi",         icon: "ShieldStar", gateKey: "micro-requirements" },
      { label: "نظام العمل",          labelEn: "Labor Law",    href: "/dashboard/micro/requirements/labor",        icon: "Briefcase", gateKey: "micro-requirements" },
      { label: "الرخص والتصاريح",    labelEn: "Licenses",     href: "/dashboard/micro/requirements/licenses",     icon: "Stamp", gateKey: "micro-requirements" },
    ],
  },
  {
    title: "مستنداتي", titleEn: "My Documents",
    items: [
      { label: "عقودي",     labelEn: "My Contracts", href: "/dashboard/micro/contracts", icon: "FileText", gateKey: "micro-contracts" },
      { label: "مستنداتي",  labelEn: "Documents",    href: "/dashboard/micro/documents", icon: "FolderOpen", gateKey: "micro-documents" },
    ],
  },
  {
    title: "المساعد الذكي", titleEn: "AI Assistant",
    collapsible: true,
    defaultOpen: true,
    items: [
      { label: "مساعد المنشآت",   labelEn: "Business Assistant", href: "/ai/micro",   icon: "Robot", gateKey: "micro-ai" },
      { label: "المستشار القانوني",labelEn: "Legal Advisor",      href: "/ai/consult", icon: "ChatCircle", gateKey: "micro-ai" },
      { label: "فاحص المستندات",  labelEn: "Doc Analyzer",       href: "/ai/analyze?source=labor", icon: "Scan", gateKey: "micro-ai" },
    ],
  },
  {
    items: [
      { label: "الإشعارات", labelEn: "Notifications", href: "/notifications", icon: "Bell",    divider: true },
      { label: "الإعدادات",  labelEn: "Settings",      href: "/settings",      icon: "GearSix" },
    ],
  },
];

// ── Provider Sidebar (مقدم خدمة) ─────────────────────────────────────────────
export const PROVIDER_SIDEBAR: SidebarGroup[] = [
  {
    items: [
      { label: "نظرة عامة",      labelEn: "Overview",   href: "/dashboard/provider",          icon: "SquaresFour" },
    ],
  },
  {
    title: "السوق والطلبات", titleEn: "Market & Requests",
    items: [
      { label: "الطلبات المتاحة", labelEn: "Browse Market",  href: "/dashboard/provider/requests", icon: "Storefront", badge: "جديد" },
      { label: "عروضي الجارية",  labelEn: "My Offers",      href: "/dashboard/provider/requests?tab=active", icon: "Package" },
      { label: "روابطي الترويجية", labelEn: "My Promos",    href: "/dashboard/provider/promotions", icon: "Tag",       badge: "جديد" },
      { label: "المواعيد",        labelEn: "Calendar",       href: "/dashboard/provider/calendar", icon: "CalendarCheck" },
    ],
  },
  {
    title: "ملفي المهني", titleEn: "My Profile",
    items: [
      { label: "الملف المهني",    labelEn: "Profile",    href: "/dashboard/provider/profile",  icon: "UserCircle" },
      { label: "الأرباح",         labelEn: "Earnings",   href: "/dashboard/provider/earnings", icon: "Money" },
      { label: "التقييمات",       labelEn: "Reviews",    href: "/dashboard/provider/reviews",  icon: "Star" },
    ],
  },
  {
    title: "مساعد الصياغة", titleEn: "Drafting Assistant",
    collapsible: true,
    defaultOpen: false,
    items: [
      { label: "صياغة تقرير",  labelEn: "Draft Report",  href: "/ai/draft?mode=report",   icon: "FileArrowUp" },
      { label: "صياغة محضر",   labelEn: "Draft Minutes", href: "/ai/draft?mode=minutes",  icon: "Note" },
      { label: "رد احترافي",    labelEn: "Smart Reply",   href: "/ai/draft?mode=reply",    icon: "ChatDots" },
    ],
  },
  {
    items: [
      { label: "الإشعارات", labelEn: "Notifications", href: "/notifications", icon: "Bell",    divider: true },
      { label: "الإعدادات",  labelEn: "Settings",      href: "/settings",      icon: "GearSix" },
    ],
  },
];

// ── Government Sidebar (جهة حكومية) — ديناميكي حسب الدور ───────────────────
export const GOVERNMENT_SIDEBAR: SidebarGroup[] = [
  {
    items: [
      { label: "نظرة عامة",        labelEn: "Overview",     href: "/dashboard/government",                 icon: "SquaresFour" },
    ],
  },
  {
    title: "الإدارة القانونية", titleEn: "Legal Management",
    items: [
      { label: "القضايا والنزاعات", labelEn: "Cases",        href: "/dashboard/government/cases",           icon: "Gavel", gateKey: "gov-ai" },
      { label: "العقود والاتفاقيات", labelEn: "Contracts",   href: "/dashboard/government/contracts",       icon: "FileText", gateKey: "gov-contracts" },
      { label: "الامتثال القانوني", labelEn: "Compliance",   href: "/dashboard/government/compliance",      icon: "ShieldCheck", gateKey: "gov-compliance" },
      { label: "المستشارون الخارجيون", labelEn: "Counsel",   href: "/dashboard/government/external-counsel", icon: "UserCircle", gateKey: "gov-counsel" },
      { label: "التقارير",          labelEn: "Reports",      href: "/dashboard/government/reports",         icon: "ChartBar", gateKey: "gov-reports" },
    ],
  },
  {
    title: "أدوات القاضي", titleEn: "Judge Tools",
    items: [
      { label: "مُرجّح الأحكام",    labelEn: "Judgment Weigher",      href: "/ai/gov/judgment-weigher",      icon: "Scales", badge: "قاضي", gateKey: "gov-judiciary" },
      { label: "باحث المبادئ",      labelEn: "Judicial Search",        href: "/ai/gov/judicial-search",       icon: "MagnifyingGlass", badge: "قاضي", gateKey: "gov-judiciary" },
      { label: "صائغ الأحكام",      labelEn: "Judgment Drafter",       href: "/ai/gov/judgment-drafter",      icon: "PencilSimple", badge: "قاضي", gateKey: "gov-judiciary" },
      { label: "صائغ المنطوق",      labelEn: "Verdict Drafter",        href: "/ai/gov/verdict-drafter",       icon: "Gavel", badge: "قاضي", gateKey: "gov-judiciary" },
      { label: "محلل الاختصاص",     labelEn: "Jurisdiction Analyzer",  href: "/ai/gov/jurisdiction-analyzer", icon: "TreeStructure", badge: "قاضي", gateKey: "gov-judiciary" },
    ],
  },
  {
    title: "أدوات النيابة", titleEn: "Prosecutor Tools",
    items: [
      { label: "صائغ لائحة الاتهام", labelEn: "Indictment Drafter",   href: "/ai/gov/indictment-drafter",    icon: "FileWarning", badge: "نيابة", gateKey: "gov-prosecution" },
      { label: "محلل الأدلة",         labelEn: "Evidence Analyzer",    href: "/ai/gov/evidence-analyzer",     icon: "Fingerprint", badge: "نيابة", gateKey: "gov-prosecution" },
      { label: "نماذج التحقيق",       labelEn: "Investigation Forms",  href: "/ai/gov/investigation-forms",   icon: "ClipboardText", badge: "نيابة", gateKey: "gov-investigation" },
      { label: "مراجع الضمانات",      labelEn: "Guarantees Checker",   href: "/ai/gov/guarantees-checker",    icon: "ShieldCheck", badge: "نيابة", gateKey: "gov-investigation" },
      { label: "حاسبة المواعيد",      labelEn: "Deadline Calculator",  href: "/ai/gov/deadline-calculator",   icon: "Timer", badge: "نيابة", gateKey: "gov-prosecution" },
    ],
  },
  {
    title: "أدوات الضابط", titleEn: "Officer Tools",
    items: [
      { label: "محاضر الضبط",         labelEn: "Detention Records",    href: "/ai/gov/detention-records",     icon: "ClipboardText", badge: "ضابط", gateKey: "gov-police" },
      { label: "تقارير الحوادث",       labelEn: "Incident Reports",     href: "/ai/gov/incident-report",       icon: "Warning", badge: "ضابط", gateKey: "gov-police" },
      { label: "نماذج القبض والتفتيش", labelEn: "Arrest Forms",         href: "/ai/gov/arrest-forms",          icon: "HandCuffs", badge: "ضابط", gateKey: "gov-police" },
      { label: "دليل الإجراءات",       labelEn: "Procedure Guide",      href: "/ai/gov/procedure-guide",       icon: "ListBullets", badge: "ضابط", gateKey: "gov-police" },
      { label: "مُذكّر الضمانات",      labelEn: "Rights Reminder",      href: "/ai/gov/rights-reminder",       icon: "Bell", badge: "ضابط", gateKey: "gov-police" },
      { label: "حاسبة المواعيد",       labelEn: "Deadline Calculator",  href: "/ai/gov/deadline-calculator",   icon: "Timer", badge: "ضابط", gateKey: "gov-police" },
    ],
  },
  {
    title: "أدوات المستشار", titleEn: "Counsel Tools",
    items: [
      { label: "مراجع المناقصات",      labelEn: "Procurement Reviewer", href: "/ai/gov/procurement-reviewer",  icon: "Buildings", badge: "مستشار", gateKey: "gov-counsel" },
      { label: "صائغ الرأي القانوني",  labelEn: "Legal Opinion",        href: "/ai/gov/legal-opinion-drafter", icon: "Lightbulb", badge: "مستشار", gateKey: "gov-counsel" },
      { label: "مدقق الامتثال",        labelEn: "Compliance Checker",   href: "/ai/gov/compliance-checker",    icon: "ShieldCheck", gateKey: "gov-compliance" },
      { label: "مراجع العقود",          labelEn: "Contract Reviewer",    href: "/ai/gov/contract-reviewer",     icon: "FileText", gateKey: "gov-contracts" },
    ],
  },
  {
    items: [
      { label: "الإعدادات",  labelEn: "Settings",      href: "/settings",       icon: "GearSix",   divider: true },
      { label: "الإشعارات",  labelEn: "Notifications", href: "/notifications",  icon: "Bell" },
    ],
  },
];

// ── NGO Sidebar (جمعية خيرية) ────────────────────────────────────────────────
export const NGO_SIDEBAR: SidebarGroup[] = [
  {
    items: [
      { label: "نظرة عامة",          labelEn: "Overview",    href: "/dashboard/ngo",              icon: "SquaresFour" },
    ],
  },
  {
    title: "إدارة الجمعية", titleEn: "NGO Management",
    items: [
      { label: "المتطوعون",           labelEn: "Volunteers",  href: "/dashboard/ngo/volunteers",   icon: "Users", gateKey: "ngo-volunteers" },
      { label: "العقود والاتفاقيات",  labelEn: "Contracts",   href: "/dashboard/ngo/contracts",    icon: "FileText" },
      { label: "الماليات والتبرعات",  labelEn: "Finance",     href: "/dashboard/ngo/finance",      icon: "Money", gateKey: "ngo-donations" },
      { label: "الأوقاف والأصول",      labelEn: "Awqaf & Assets", href: "/dashboard/ngo/awqaf",     icon: "Buildings", gateKey: "ngo-awqaf", badge: "Beta" },
      { label: "البرامج والحملات",     labelEn: "Programs",    href: "/dashboard/ngo/programs",    icon: "Target", gateKey: "ngo-programs", badge: "Beta" },
      { label: "مجلس الإدارة",         labelEn: "Board",       href: "/dashboard/ngo/board",       icon: "UsersThree", gateKey: "ngo-board", badge: "Beta" },
      { label: "الامتثال والحوكمة",   labelEn: "Compliance",  href: "/dashboard/ngo/compliance",   icon: "ShieldCheck", gateKey: "ngo-compliance" },
      { label: "التقارير الدورية",    labelEn: "Reports",     href: "/dashboard/ngo/reports",      icon: "ChartBar", gateKey: "ngo-reports" },
    ],
  },
  {
    title: "أدوات الذكاء الاصطناعي", titleEn: "AI Tools",
    items: [
      { label: "صائغ عقود التطوع",   labelEn: "Volunteer Contract",  href: "/ai/ngo/volunteer-contract",  icon: "HandHeart", gateKey: "ngo-ai" },
      { label: "مدقق الحوكمة",        labelEn: "Governance Checker",  href: "/ai/ngo/governance-checker",  icon: "ShieldCheck", gateKey: "ngo-ai" },
      { label: "محلل التبرعات",       labelEn: "Donation Analyzer",   href: "/ai/ngo/donation-analyzer",   icon: "ChartBar", gateKey: "ngo-ai" },
      { label: "مُعد التقارير",       labelEn: "Report Generator",    href: "/ai/ngo/report-generator",    icon: "FileText", gateKey: "ngo-ai" },
      { label: "المستشار الذكي",      labelEn: "AI Consult",          href: "/ai/consult",                 icon: "Robot", gateKey: "ngo-ai" },
      { label: "مراجع العقود",         labelEn: "Contract Review",     href: "/ai/contracts",               icon: "Files", gateKey: "ngo-ai" },
    ],
  },
  {
    title: "سوق الخدمات", titleEn: "Marketplace",
    items: [
      { label: "تصفح المهنيين",       labelEn: "Browse Lawyers",      href: "/marketplace",                icon: "UsersFour" },
      { label: "طلباتي",              labelEn: "My Requests",         href: "/marketplace?tab=my-requests", icon: "ClipboardList" },
    ],
  },
  {
    items: [
      { label: "الإعدادات",  labelEn: "Settings",      href: "/settings",       icon: "GearSix",   divider: true },
      { label: "الإشعارات",  labelEn: "Notifications", href: "/notifications",  icon: "Bell" },
    ],
  },
];
