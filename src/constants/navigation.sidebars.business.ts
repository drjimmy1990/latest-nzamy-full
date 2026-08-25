import type { SidebarGroup } from "./navigation.types";

// ── Corporate Sidebar (شركة) ──────────────────────────────────────
//
// 2026-08-26 — the owner's consolidated ruling §3أ. Every entry removed below
// linked to a screen that renders invented data: hardcoded arrays of cases,
// departments, employees, invoices and "reports" that belong to no real company,
// or an "AI tool" whose only asynchronous work is a setTimeout followed by a
// canned answer. His reason, in his words: a paying company opening the
// dashboard and seeing cases that are not its own is worse than an empty screen.
//
// The pages themselves are NOT deleted — they stay in the tree for the wave that
// builds each one for real. Only the links are gone, plus a guard in
// src/app/dashboard/business/layout.tsx so a bookmarked URL does not walk past
// the hidden link straight back into the fabricated screen.
//
// Removed, with the evidence (file:line of the invented data):
//   إدارة القضايا          → constants/businessCasesData.ts:34   MOCK_CASES
//   الدوائر والإيميلات    → business/circuits-emails/page.tsx:25   INITIAL_CIRCUITS
//   الأقسام               → business/departments/page.tsx:43       MOCK_DEPTS
//   إدارة الفريق           → business/team/page.tsx:72             MEMBERS (+ a fake invite link, :141)
//   لوحة المهام            → business/kanban/page.tsx:67           MOCK_CARDS
//   عقود الموظفين         → business/employee-contracts/page.tsx:34  CONTRACTS
//   التقارير               → business/reports/page.tsx:14          DEPT_REPORTS / MONTHLY_TREND
//   باقتنا                 → business/wallet/page.tsx:12,21,28     invented plan, usage log and two PAID invoices
//   الفحص القانوني ٣٦٠°    → constants/healthCheckData.ts:16,42   MOCK_FILES / MOCK_FINDINGS
//   الحوكمة + الموافقات     → business/governance/page.tsx:33      MOCK_RULES
//   مراجعات الإدارات       → business/reviews/page.tsx:48         MOCK_DOCS
//   إرسال للمراجعة         → business/reviews/new/page.tsx:14     writes to localStorage, never to service_requests
//   المستشار المنتدب        → business/seconded-counsel/page.tsx:16,41  COUNSEL / TASKS
//   طلباتي في السوق        → components/marketplace/MyMarketplaceDashboardData  MY_REQUESTS
//   تصفح السوق / انشر طلباً → the marketplace is not part of the manual-fulfilment model
//   the 11 «أدوات AI للشركات»  → ai/corp/contracts:89, ai/corp/advisor:70, ai/corp/hr:67,
//                                 ai/corp/deal-intel:88, ai/corp/corpmind:246 — setTimeout, then a canned answer
//
// Kept because each one resolves to something that is really there today:
// the overview shell, the blog, notifications and settings.
//
// NOT re-added yet, and each is somebody else's file — see the cluster report:
//   «طلب خدمة جديدة» / «متابعة الطلبات»  — the real intake lives under /dashboard/client/*,
//        which src/proxy.ts:16 refuses to a corporate account.
//   «خزنة وثائق الشركة»        — no route exists yet.
//   «باقتنا والاشتراك»          — no destination that is not fabricated.
export const CORPORATE_SIDEBAR: SidebarGroup[] = [
  {
    items: [
      { label: "نظرة عامة", labelEn: "Overview", href: "/dashboard/business", icon: "SquaresFour" },
    ],
  },
  {
    items: [
      // The divider sits on الإشعارات, not on the blog: CORP_ROLE_ALLOWED_ITEMS
      // (navigation.sidebars.ts:281) withholds "Legal Blog" from five of the nine
      // business roles, and a separator attached to a filtered-out item vanishes
      // with it. الإشعارات is in all nine lists.
      { label: "الإشعارات", labelEn: "Notifications", href: "/notifications", icon: "Bell", divider: true },
      { label: "المدونة القانونية", labelEn: "Legal Blog", href: "/blog", icon: "Article" },
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
      { label: "طلباتي الذكية", labelEn: "My AI Orders",  href: "/ai/orders",              icon: "Tray",  divider: true },
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
      { label: "طلباتي الذكية",        labelEn: "My AI Orders",        href: "/ai/orders",                  icon: "Tray", gateKey: "ngo-ai", divider: true },
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

// ── Which /dashboard/business/* routes are still reachable ────────────────
//
// Removing a sidebar link hides a section from anyone browsing. It does nothing
// for the company that bookmarked /dashboard/business/kanban last week — that
// URL still renders the invented kanban. So the visible set is derived from
// CORPORATE_SIDEBAR itself (it cannot drift from the links above) and the
// business layout renders a plain notice for anything outside it.
//
// This is a UX guard, not a security boundary: it runs in the browser, and the
// pages it covers hold no real data to protect — that is precisely the problem
// it exists to hide. The server-side rules for these routes are unchanged and
// still live in src/constants/entityRouteAccess.ts and src/proxy.ts.

const BUSINESS_ROOT = "/dashboard/business";

/** Strip the query, the hash and any trailing slashes. "" normalises to "/". */
function normalisePath(value: string): string {
  const withoutQuery = value.split("?")[0].split("#")[0];
  const trimmed = withoutQuery.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/**
 * Every /dashboard/business route the corporate sidebar still links to.
 * Derived from CORPORATE_SIDEBAR so that re-adding a link automatically
 * re-opens its route, and hiding one closes it.
 */
export const VISIBLE_BUSINESS_ROUTES: readonly string[] = CORPORATE_SIDEBAR
  .flatMap((group) => group.items)
  .map((item) => normalisePath(item.href))
  .filter((href) => href === BUSINESS_ROOT || href.startsWith(`${BUSINESS_ROOT}/`));

/**
 * True when `pathname` is one of the corporate sections that survived the
 * 26 August ruling — or a sub-page of one.
 *
 * The dashboard root is matched exactly and never as a prefix: it is the parent
 * of every hidden section, so prefix-matching it would let all of them through.
 */
export function isVisibleBusinessRoute(
  pathname: string,
  visibleRoutes: readonly string[] = VISIBLE_BUSINESS_ROUTES,
): boolean {
  const path = normalisePath(pathname);
  return visibleRoutes.some((route) => {
    const allowed = normalisePath(route);
    if (allowed === BUSINESS_ROOT) return path === BUSINESS_ROOT;
    return path === allowed || path.startsWith(`${allowed}/`);
  });
}
