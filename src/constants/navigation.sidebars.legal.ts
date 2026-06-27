import type { SidebarGroup } from "./navigation.types";

// ── Lawyer Sidebar (محامي فرد) ───────────────────────────────────────────────
export const LAWYER_SIDEBAR: SidebarGroup[] = [
  // ── ① نظرة عامة — أول ما يفتح المحامي الداشبورد ──────────────────────────
  {
    items: [
      { label: "نظرة عامة", labelEn: "Overview", href: "/dashboard/lawyer", icon: "SquaresFour" },
    ],
  },

  // ── ② الجلسات والقضايا — الأكثر تكراراً يومياً ────────────────────────────
  {
    title: "الجلسات والقضايا", titleEn: "Hearings & Cases",
    collapsible: false,
    items: [
      { label: "الجلسات القادمة",    labelEn: "Hearings",       href: "/dashboard/lawyer/hearings",  icon: "CalendarCheck" },
      { label: "جميع القضايا",       labelEn: "All Cases",      href: "/dashboard/lawyer/cases",     icon: "Gavel" },
      { label: "مهامي",              labelEn: "My Tasks",       href: "/dashboard/lawyer/tasks",     icon: "CheckSquare" },
      { label: "سجل النشاط",        labelEn: "Activity Log",   href: "/dashboard/lawyer/activity",  icon: "ClockCounterClockwise" },
    ],
  },

  // ── ③ نظامي AI — قلب العمل اليومي للمحامي ────────────────────────────────
  {
    title: "نظامي AI", titleEn: "Nezamy AI",
    collapsible: true,
    defaultOpen: true,
    items: [
      // ١: الخطوة صفر — فهم الملف أولاً
      { label: "ParaLegal",           labelEn: "ParaLegal (AI Briefing)", href: "/ai/case-brief",     icon: "Scan",         badge: "جديد" },
      { label: "سؤال قانوني سريع", labelEn: "Quick Legal Q&A",         href: "/ai/quick-answer",  icon: "ChatCircle",   badge: "جديد" },
      // ٢: الصياغة — العمل اليومي الأكثر تكراراً
      { label: "الصائغ القانوني",  labelEn: "Legal Drafter",            href: "/ai/draft",         icon: "PencilSimple", divider: true },
      { label: "المجمّع البحثي",   labelEn: "Research Collector",       href: "/ai/collector",    icon: "Tray",         badge: "جديد" },
      { label: "محترف العقود",      labelEn: "Contract Pro",             href: "/ai/contracts",     icon: "FileText" },
      // ٣: الاستراتيجية — للقضايا الكبيرة
      { label: "المحاكي الشامل",   labelEn: "Litigation Studio",        href: "/ai/wargaming",     icon: "Scales",       divider: true, badge: "مُدمَج" },
      { label: "عصارة المرفقات",    labelEn: "Attachment Analyzer",      href: "/ai/analyze",       icon: "MagnifyingGlass", badge: "PRO" },
      { label: "الرأي الفصل",       labelEn: "Al-Ra'y Al-Fasl",          href: "/ai/legal-opinion", icon: "Lightbulb",    badge: "PRO" },
      // ٤: المساعدة والمتابعة
      { label: "السكرتير الذكي",    labelEn: "AI Secretary",             href: "/ai/secretary",     icon: "Robot",        divider: true },
      { label: "راصد التشريعات",    labelEn: "Law Monitor",              href: "/ai/monitor",       icon: "Bell" },
    ],
  },

  // ── ④ العملاء — مرتبط بالقضايا مباشرة ──────────────────────────────────
  {
    title: "العملاء", titleEn: "Clients",
    collapsible: true,
    defaultOpen: true,
    items: [
      { label: "دليل العملاء", labelEn: "Clients",       href: "/dashboard/lawyer/clients",       icon: "AddressBook" },
      { label: "الاستشارات",  labelEn: "Consultations", href: "/dashboard/lawyer/consultations", icon: "ChatDots" },
    ],
  },

  // ── ⑤ المستندات والعقود ───────────────────────────────────────────────────
  {
    title: "العقود والمستندات", titleEn: "Contracts & Docs",
    collapsible: true,
    defaultOpen: false,
    items: [
      { label: "مدير العقود",    labelEn: "Contracts",       href: "/dashboard/lawyer/contracts", icon: "FileText" },
      { label: "المستندات",      labelEn: "Documents",        href: "/dashboard/lawyer/documents", icon: "FolderOpen" },
      { label: "الأرشيف الموحّد", labelEn: "Unified Archive", href: "/dashboard/lawyer/archive",   icon: "Archive",   badge: "جديد" },
    ],
  },

  // ── ⑥ الماليات — مهم لكن ليس يومياً ──────────────────────────────────────
  {
    title: "الماليات", titleEn: "Finance",
    collapsible: true,
    defaultOpen: false,
    items: [
      { label: "الإيرادات والفواتير", labelEn: "Finance & Invoices", href: "/dashboard/lawyer/finance", icon: "Money" },
    ],
  },

  // ── ⑦ أدوات ثانوية (مطوية افتراضياً) ────────────────────────────────────
  {
    title: "أدوات إضافية", titleEn: "More Tools",
    collapsible: true,
    defaultOpen: false,
    items: [
      // ١: مهام يومية متكررة
      { label: "المرشد القضائي",    labelEn: "Court Guide",       href: "/ai/procedures",       icon: "MapTrifold" },
      { label: "الحاسبة القانونية",  labelEn: "Legal Calculator",  href: "/ai/fee-calculator",   icon: "Calculator" },
      { label: "منقح ناجز",          labelEn: "Najiz Optimizer",   href: "/ai/najiz-optimizer",  icon: "Broom" },
      // ٢: دوري أو عند الحاجة
      { label: "داعم الاتجاه",      labelEn: "Direction Support",  href: "/ai/direction-support", icon: "Compass",       badge: "جديد", divider: true },
      { label: "المترجم القانوني",  labelEn: "Legal Translator",  href: "/ai/legal-translate",  icon: "Translate",     badge: "جديد" },
      { label: "المفرّغ الذكي",      labelEn: "Transcriber",       href: "/ai/transcriber",      icon: "Microphone" },
      { label: "المقارن الذكي",      labelEn: "Smart Comparator",  href: "/ai/compare",          icon: "ArrowsLeftRight", badge: "جديد" },
    ],
  },

  // ── ⑧ شبكة التعاون (Solo+ & Secondment & Referral) — S59 ────────────────────
  {
    title: "شبكة التعاون", titleEn: "My Network",
    collapsible: true,
    defaultOpen: false,
    items: [
      { label: "مركز التعاون (Solo+)", labelEn: "Collaboration Hub", href: "/dashboard/lawyer/network",      icon: "UsersThree",      badge: "جديد" },
    ],
  },

  // ── ⑨ التطوير والسوق ─────────────────────────────────────────────────────
  {
    title: "السوق والتطوير", titleEn: "Market & Growth",
    collapsible: true,
    defaultOpen: false,
    items: [
      { label: "الملف المهني",       labelEn: "My Profile",   href: "/dashboard/lawyer/profile",     icon: "UserCircle" },
      { label: "عروضي الترويجية",   labelEn: "My Promos",    href: "/dashboard/lawyer/promotions",  icon: "Tag",             badge: "جديد" },
      { label: "طلباتي في السوق",   labelEn: "My Requests",  href: "/dashboard/lawyer/marketplace", icon: "Storefront",      badge: "جديد" },
      { label: "تصفح السوق",         labelEn: "Browse",       href: "/marketplace",                   icon: "MagnifyingGlass" },
      { label: "تعاون مباشر",        labelEn: "Collaborate",  href: "/marketplace/collaborate",       icon: "Handshake",       badge: "جديد" },
    ],
  },

  // ── ⑩ خدمات متقدمة ───────────────────────────────────────────────────────
  {
    title: "خدمات متقدمة", titleEn: "Advanced Services",
    collapsible: true,
    defaultOpen: false,
    items: [
      { label: "الخزنة القانونية",  labelEn: "Legal Vault",  href: "/services/lawyers/vault",       icon: "Vault",           badge: "جديد" },
    ],
  },

  // ── ⑪ الذيل الثابت ───────────────────────────────────────────────────────
  {
    items: [
      { label: "المجتمع القانوني",  labelEn: "Community",    href: "/community/lawyers", icon: "ChatCircle",   badge: "للمحامين", divider: true },
      { label: "المكتبة القانونية", labelEn: "Legal Library", href: "/laws",              icon: "BookOpen" },
      { label: "أكاديمية نظامي",   labelEn: "Academy",       href: "/academy",           icon: "GraduationCap", badge: "جديد" },
      { label: "الإشعارات",         labelEn: "Notifications", href: "/notifications",     icon: "Bell" },
      { label: "الإعدادات",          labelEn: "Settings",      href: "/settings",          icon: "GearSix" },
    ],
  },
];

// ── Lawyer Sidebar LITE (عرض يومي مختصر — ليس اشتراكاً أو باقة) ─────────────
export const LAWYER_SIDEBAR_LITE: SidebarGroup[] = [
  {
    items: [
      { label: "نظرة عامة", labelEn: "Overview", href: "/dashboard/lawyer", icon: "SquaresFour" },
    ],
  },
  {
    title: "الجلسات والقضايا", titleEn: "Hearings & Cases",
    items: [
      { label: "الجلسات القادمة", labelEn: "Hearings",  href: "/dashboard/lawyer/hearings", icon: "CalendarCheck" },
      { label: "جميع القضايا",   labelEn: "All Cases", href: "/dashboard/lawyer/cases",    icon: "Gavel" },
      { label: "مهامي",          labelEn: "My Tasks",  href: "/dashboard/lawyer/tasks",    icon: "CheckSquare" },
    ],
  },
  {
    title: "نظامي AI — أساسية", titleEn: "Nezamy AI — Core",
    collapsible: true,
    defaultOpen: true,
    items: [
      { label: "ParaLegal",           labelEn: "ParaLegal (AI Briefing)", href: "/ai/case-brief",     icon: "Scan",         badge: "جديد" },
      { label: "سؤال قانوني سريع",  labelEn: "Quick Q&A",       href: "/ai/quick-answer",  icon: "ChatCircle",   badge: "جديد" },
      { label: "الصائغ القانوني",   labelEn: "Legal Drafter",   href: "/ai/draft",         icon: "PencilSimple", divider: true },
      { label: "محترف العقود",      labelEn: "Contract Pro",    href: "/ai/contracts",     icon: "FileText" },
      { label: "الرأي الفصل",       labelEn: "Legal Opinion",   href: "/ai/legal-opinion", icon: "Lightbulb" },
      { label: "عصارة المرفقات",    labelEn: "Doc Analyzer",    href: "/ai/analyze",       icon: "MagnifyingGlass" },
    ],
  },
  {
    title: "العملاء", titleEn: "Clients",
    items: [
      { label: "دليل العملاء", labelEn: "Clients", href: "/dashboard/lawyer/clients", icon: "AddressBook" },
    ],
  },
  {
    items: [
      { label: "طلباتي",       labelEn: "My Requests", href: "/marketplace", icon: "Storefront", divider: true },
      { label: "المكتبة القانونية", labelEn: "Legal Library", href: "/laws",              icon: "BookOpen" },
      { label: "الإعدادات",    labelEn: "Settings",     href: "/settings",    icon: "GearSix" },
    ],
  },
];

// ── Firm Sidebar (شركة محاماة) ────────────────────────────────────────────────
export const FIRM_SIDEBAR: SidebarGroup[] = [
  {
    items: [
      { label: "نظرة عامة",    labelEn: "Overview", href: "/dashboard/firm",              icon: "SquaresFour" },
    ],
  },
  {
    title: "القضايا والملفات", titleEn: "Cases",
    items: [
      { label: "جميع القضايا",   labelEn: "All Cases",    href: "/dashboard/firm/cases",         icon: "Gavel" },
      { label: "الجلسات",         labelEn: "Hearings",     href: "/dashboard/firm/hearings",      icon: "CalendarCheck" },
      { label: "توزيع القضايا",   labelEn: "Assignments",  href: "/dashboard/firm/cases/assign",  icon: "ArrowsSplit" },
      { label: "مهام الفريق",     labelEn: "Team Tasks",   href: "/dashboard/firm/tasks",         icon: "CheckSquare" },
      { label: "سجل النشاط",       labelEn: "Activity Log", href: "/dashboard/firm/activity",      icon: "ClockCounterClockwise" },
    ],
  },
  {
    title: "العقود", titleEn: "Contracts",
    items: [
      { label: "مدير العقود",     labelEn: "Contract Manager", href: "/dashboard/firm/contracts",  icon: "FileText" },
      { label: "النماذج القياسية",labelEn: "Templates",         href: "/dashboard/firm/templates",  icon: "CopySimple" },
      { label: "المستندات",        labelEn: "Documents",         href: "/dashboard/firm/documents",  icon: "FolderOpen" },
      { label: "الأرشيف الموحّد",   labelEn: "Unified Archive",   href: "/dashboard/firm/archive",    icon: "Archive" },
    ],
  },
  {
    title: "العملاء", titleEn: "Clients",
    items: [
      { label: "دليل العملاء",   labelEn: "Clients",       href: "/dashboard/firm/clients",       icon: "AddressBook" },
      { label: "الاستشارات",     labelEn: "Consultations", href: "/dashboard/firm/consultations", icon: "ChatDots" },
      { label: "بوابة العميل",   labelEn: "Client Portal", href: "/dashboard/firm/client-portal", icon: "Globe", gateKey: "firm-client-portal" },
      { label: "تخصيص البوابة",  labelEn: "Branding",      href: "/dashboard/firm/branding",      icon: "Palette", badge: "PRO", gateKey: "firm-branding" },
    ],
  },
  {
    title: "الفريق والموارد البشرية", titleEn: "Team & HR",
    items: [
      { label: "أعضاء الفريق",     labelEn: "Team",         href: "/dashboard/firm/team",             icon: "Users", gateKey: "firm-team" },
      { label: "الصلاحيات والأدوار",labelEn: "Roles",       href: "/dashboard/firm/team/roles",       icon: "Key", gateKey: "firm-team" },
      { label: "سجلات الساعات",     labelEn: "Timesheets",  href: "/dashboard/firm/team/timesheets",  icon: "Clock", badge: "أساسي" },
      { label: "المتدربون",          labelEn: "Trainees",    href: "/dashboard/firm/team/trainees",    icon: "Student" },
      { label: "الحضور والإجازات",   labelEn: "Attendance",  href: "/dashboard/firm/team/attendance",  icon: "CalendarBlank" },
      { label: "الإنجازات والمكافآت",labelEn: "Achievements", href: "/dashboard/firm/achievements",    icon: "Trophy", badge: "جديد" },
    ],
  },
  {
    title: "الإدارات والأقسام", titleEn: "Departments",
    items: [
      { label: "إدارة الأقسام",     labelEn: "Manage Departments",   href: "/dashboard/firm/departments",  icon: "TreeStructure", gateKey: "firm-departments" },
      { label: "فروع المكتب",       labelEn: "Firm Branches",        href: "/dashboard/firm/branches",     icon: "MapPin", gateKey: "firm-branches" },
      { label: "إعدادات الصلاحيات", labelEn: "Dept Permissions",     href: "/dashboard/firm/departments/permissions", icon: "ShieldCheck", badge: "جديد", gateKey: "firm-departments" },
    ],
  },
  {
    title: "الحوكمة والامتثال", titleEn: "Governance & Compliance",
    collapsible: true,
    defaultOpen: false,
    items: [
      { label: "فحص تعارض المصالح", labelEn: "Conflict Check", href: "/dashboard/firm/compliance/conflict",   icon: "WarningCircle", badge: "حرج" },
      { label: "اعتماد العملاء (KYC)",labelEn: "Client KYC",     href: "/dashboard/firm/compliance/kyc",        icon: "ShieldCheck" },
      { label: "الجدران الصينية",    labelEn: "Chinese Walls",  href: "/dashboard/firm/compliance/walls",      icon: "Wall",          badge: "Enterprise", gateKey: "firm-chinese-walls" },
      { label: "الفحص الشامل ٣٦٠°", labelEn: "Health Check 360°",  href: "/dashboard/firm/health-check",     icon: "MagnifyingGlass", badge: "جديد", gateKey: "firm-health-check" },
      { label: "الحوكمة المؤسسية",   labelEn: "Governance",         href: "/dashboard/firm/governance",            icon: "ShieldCheck", badge: "جديد", gateKey: "firm-governance" },
      { label: "مصفوفة الحوكمة",     labelEn: "Governance Matrix",  href: "/dashboard/firm/governance?tab=matrix",  icon: "ListChecks", gateKey: "firm-governance" },
    ],
  },
  {
    title: "الماليات والتقارير", titleEn: "Finance & Reports",
    items: [
      { label: "الإيرادات",       labelEn: "Revenue",    href: "/dashboard/firm/finance",           icon: "Money", gateKey: "firm-finance" },
      { label: "الأتعاب",          labelEn: "Fees",       href: "/dashboard/firm/fees",              icon: "Receipt", gateKey: "firm-finance" },
      { label: "التقارير المالية", labelEn: "Reports",    href: "/dashboard/firm/finance/reports",   icon: "ChartBar", gateKey: "firm-finance" },
      { label: "لوحة التحليلات",  labelEn: "Analytics",  href: "/dashboard/firm/analytics",         icon: "ChartLine", gateKey: "firm-analytics" },
    ],
  },
  {
    title: "نظامي AI", titleEn: "Nezamy AI",
    collapsible: true,
    defaultOpen: true,
    items: [
      // ① الخطوة صفر — فهم الملف أولاً (مضاف S59)
      { label: "ParaLegal",              labelEn: "ParaLegal (AI Briefing)", href: "/ai/case-brief",        icon: "Scan",         badge: "جديد" },
      { label: "سؤال قانوني سريع",     labelEn: "Quick Legal Q&A",   href: "/ai/quick-answer",      icon: "ChatCircle",   badge: "جديد" },
      // ② الصياغة والتحرير
      { label: "الصائغ القانوني",       labelEn: "Legal Drafter",    href: "/ai/draft",            icon: "PencilSimple", divider: true },
      { label: "المجمّع البحثي",        labelEn: "Research Collector", href: "/ai/collector",      icon: "Tray",         badge: "جديد" },
      { label: "محترف العقود",           labelEn: "Contract Pro",     href: "/ai/contracts",        icon: "FileText" },
      { label: "مفاوض العقود",           labelEn: "Contract Negotiator", href: "/ai/contract-negotiator",  icon: "Handshake", badge: "جديد" },
      { label: "مراجع العقود",           labelEn: "Contract Reviewer",   href: "/ai/contract-reviewer",    icon: "MagnifyingGlass", badge: "جديد" },
      { label: "الرأي الفصل",           labelEn: "Al-Ra'y Al-Fasl", href: "/ai/legal-opinion",    icon: "Lightbulb",    badge: "PRO" },
      { label: "منقح ناجز",             labelEn: "Najiz Optimizer",  href: "/ai/najiz-optimizer",  icon: "Broom",        badge: "جديد" },
      // ③ التحليل والاستراتيجية
      { label: "المحاكي الشامل للقضايا",labelEn: "Litigation Studio", href: "/ai/wargaming",        icon: "Scales",       divider: true, badge: "مُدمَج" },
      { label: "فاحص المستندات",        labelEn: "Doc Analyzer",     href: "/ai/analyze?source=firm", icon: "MagnifyingGlass", gateKey: "firm-ai" },
      // ④ البحث والمراقبة
      { label: "المرشد القضائي",        labelEn: "Court Guide",      href: "/ai/procedures",       icon: "MapTrifold",   divider: true },
      { label: "راصد التشريعات",        labelEn: "Law Monitor",      href: "/ai/monitor",          icon: "Bell" },
      // ⑤ المساعدة الذكية
      { label: "السكرتير الذكي",        labelEn: "AI Secretary",     href: "/ai/secretary",        icon: "Robot",        divider: true },
      { label: "الحاسبة القانونية",     labelEn: "Legal Calculator", href: "/ai/fee-calculator",   icon: "Calculator" },
      { label: "مولّد التقارير",        labelEn: "Report Generator", href: "/ai/report-generator", icon: "FileArrowUp",  badge: "جديد" },
    ],
  },
  // ── أدوات المكتب المؤسسية (الفيرم ككيان تجاري يحتاج أدوات الشركات) ──────
  {
    title: "أدوات المكتب المؤسسية", titleEn: "Firm Corporate Tools",
    collapsible: true,
    defaultOpen: false,
    items: [
      { label: "المستشار التجاري",    labelEn: "Business Advisor",       href: "/ai/corp/advisor",            icon: "Briefcase" },
      { label: "مدير العقود CLM",      labelEn: "Contract Lifecycle",     href: "/ai/corp/clm",                icon: "ArrowsClockwise" },
      { label: "مراقب الامتثال",       labelEn: "Compliance Monitor",     href: "/ai/corp/compliance-monitor",  icon: "ShieldCheck" },
      { label: "مستشار الموارد البشرية", labelEn: "HR Advisor",           href: "/ai/corp/hr",                 icon: "UserCirclePlus" },
    ],
  },
  // ── أدوات قانونية إضافية (موروثة من المحامي الفرد) ───────────────────────
  {
    title: "أدوات قانونية إضافية", titleEn: "More Legal Tools",
    collapsible: true,
    defaultOpen: false,
    items: [
      { label: "داعم الاتجاه",      labelEn: "Direction Support",  href: "/ai/direction-support", icon: "Compass",         badge: "جديد" },
      { label: "المترجم القانوني",  labelEn: "Legal Translator",   href: "/ai/legal-translate",   icon: "Translate",       badge: "جديد" },
      { label: "المفرّغ الذكي",      labelEn: "Transcriber",        href: "/ai/transcriber",       icon: "Microphone" },
      { label: "المقارن الذكي",      labelEn: "Smart Comparator",   href: "/ai/compare",           icon: "ArrowsLeftRight", badge: "جديد" },
      { label: "الدوائر والإيميلات",  labelEn: "Circuits & Emails",  href: "/dashboard/firm/circuits-emails",  icon: "Envelope" },
    ],
  },
  // ── التعاون الخارجي (Of-Counsel & Secondment & Inter-Firm) — S59 ─────────
  {
    title: "التعاون الخارجي", titleEn: "External Collaboration",
    collapsible: true,
    defaultOpen: false,
    items: [
      { label: "مستشارون خارجيون",  labelEn: "Of-Counsel",        href: "/dashboard/firm/of-counsel",     icon: "UserCircle",      badge: "جديد", gateKey: "firm-collaboration" },
      { label: "عرض إعارة محامٍ",    labelEn: "Post Secondment",   href: "/dashboard/firm/secondment/new", icon: "ArrowsLeftRight", badge: "جديد", gateKey: "firm-secondment" },
      { label: "الغرف المشتركة",     labelEn: "Shared Rooms",      href: "/dashboard/firm/shared-rooms",   icon: "UsersThree",      badge: "جديد", gateKey: "firm-shared-rooms" },
    ],
  },
  {
    title: "سوق المهنيين", titleEn: "Marketplace",
    collapsible: true,
    defaultOpen: true,
    items: [
      { label: "طلباتي في السوق",   labelEn: "My Requests",   href: "/dashboard/firm/marketplace",  icon: "Storefront",      badge: "جديد", gateKey: "firm-marketplace" },
      { label: "تصفح السوق",         labelEn: "Browse Market", href: "/marketplace",                  icon: "MagnifyingGlass", gateKey: "firm-marketplace" },
      { label: "انشر طلباً جديداً", labelEn: "Post Request",   href: "/marketplace/post",             icon: "PencilSimple", gateKey: "firm-marketplace" },
      { label: "تعاون مباشر",        labelEn: "Collaborate",   href: "/marketplace/collaborate",      icon: "Handshake",       badge: "جديد", gateKey: "firm-marketplace" },
    ],
  },
  {
    title: "خدمات متقدمة", titleEn: "Advanced Services",
    collapsible: true,
    defaultOpen: false,
    items: [
      { label: "الخزنة القانونية", labelEn: "Legal Vault",    href: "/services/lawyers/vault",  icon: "Vault", badge: "جديد" },
      { label: "الملف المهني للمكتب", labelEn: "Firm Profile",   href: "/dashboard/firm/profile",  icon: "UserCircle" },
    ],
  },
  {
    items: [
      { label: "المجتمع القانوني",  labelEn: "Legal Community", href: "/community/lawyers",   icon: "ChatCircle", divider: true },
      { label: "المدونة القانونية", labelEn: "Legal Blog",      href: "/blog",                icon: "Article" },
      { label: "المكتبة القانونية", labelEn: "Legal Library", href: "/laws",          icon: "BookOpen" },
      { label: "أكاديمية نظامي",   labelEn: "Nezamy Academy",  href: "/academy",       icon: "GraduationCap", badge: "جديد" },
      { label: "الإشعارات",         labelEn: "Notifications", href: "/notifications", icon: "Bell" },
      { label: "الإعدادات",          labelEn: "Settings",      href: "/settings",      icon: "GearSix" },
    ],
  },
];

// ── Firm Sidebar LITE (عرض يومي مختصر — ليس اشتراكاً أو باقة) ───────────────
export const FIRM_SIDEBAR_LITE: SidebarGroup[] = [
  {
    items: [
      { label: "نظرة عامة", labelEn: "Overview", href: "/dashboard/firm", icon: "SquaresFour" },
    ],
  },
  {
    title: "العمل اليومي", titleEn: "Daily Work",
    items: [
      { label: "جميع القضايا", labelEn: "All Cases", href: "/dashboard/firm/cases", icon: "Gavel" },
      { label: "الجلسات", labelEn: "Hearings", href: "/dashboard/firm/hearings", icon: "CalendarCheck" },
      { label: "مهام الفريق", labelEn: "Team Tasks", href: "/dashboard/firm/tasks", icon: "CheckSquare" },
    ],
  },
  {
    title: "العملاء والمستندات", titleEn: "Clients & Documents",
    items: [
      { label: "دليل العملاء", labelEn: "Clients", href: "/dashboard/firm/clients", icon: "AddressBook" },
      { label: "مدير العقود", labelEn: "Contract Manager", href: "/dashboard/firm/contracts", icon: "FileText" },
      { label: "المستندات", labelEn: "Documents", href: "/dashboard/firm/documents", icon: "FolderOpen" },
    ],
  },
  {
    title: "الفريق", titleEn: "Team",
    items: [
      { label: "أعضاء الفريق", labelEn: "Team", href: "/dashboard/firm/team", icon: "Users", gateKey: "firm-team" },
      { label: "الصلاحيات والأدوار", labelEn: "Roles", href: "/dashboard/firm/team/roles", icon: "Key", gateKey: "firm-team" },
    ],
  },
  {
    title: "نظامي AI — أساسية", titleEn: "Nezamy AI — Core",
    collapsible: true,
    defaultOpen: true,
    items: [
      { label: "ParaLegal", labelEn: "ParaLegal (AI Briefing)", href: "/ai/case-brief", icon: "Scan", badge: "جديد" },
      { label: "سؤال قانوني سريع", labelEn: "Quick Legal Q&A", href: "/ai/quick-answer", icon: "ChatCircle", badge: "جديد" },
      { label: "الصائغ القانوني", labelEn: "Legal Drafter", href: "/ai/draft", icon: "PencilSimple", divider: true },
      { label: "محترف العقود", labelEn: "Contract Pro", href: "/ai/contracts", icon: "FileText" },
      { label: "مراجع العقود", labelEn: "Contract Reviewer", href: "/ai/contract-reviewer", icon: "MagnifyingGlass", badge: "جديد" },
      { label: "فاحص المستندات", labelEn: "Doc Analyzer", href: "/ai/analyze?source=firm", icon: "MagnifyingGlass", gateKey: "firm-ai" },
    ],
  },
  {
    items: [
      { label: "طلباتي في السوق", labelEn: "My Requests", href: "/dashboard/firm/marketplace", icon: "Storefront", divider: true, gateKey: "firm-marketplace" },
      { label: "المكتبة القانونية", labelEn: "Legal Library", href: "/laws", icon: "BookOpen" },
      { label: "الإعدادات", labelEn: "Settings", href: "/settings", icon: "GearSix" },
    ],
  },
];
