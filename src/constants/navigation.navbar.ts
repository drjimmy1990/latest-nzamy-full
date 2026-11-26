import type { UserType } from "@/hooks/useUser";
import type { NavItem } from "./navigation.types";

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: NAVBAR CONFIGS (Top navigation bar per user type)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Public Nav (Visitors / Not logged in) ────────────────────────────────────
// «الخدمات» is the mega menu the owner approved in 4 Oct item 129: one entry
// whose panel sorts the services into four groups. The group titles are his
// own words (ruling P18). It replaced four top-level links — «خدمات الأفراد»,
// «الشركات», «المحامين», «ذكاء نظامي» — and every one of their pages is still
// linked here, once (navigation.navbar.test.ts). A group's `href` is a "#"
// placeholder: the title is a heading, never a destination.
//
// Each group opens with its overview page, then every public service page
// that belongs to it, each labelled with its own page's title. A page joins
// only when it is real and honest: not «قريباً», not a redirect, no invented
// figures and no feature the platform does not have. Every /services page has
// a recorded decision; the ones left out, and why, are LEFT_OUT in
// navigation.navbar.test.ts. Re-vet a page there before adding it here.
export const PUBLIC_NAV: NavItem[] = [
  { label: "الرئيسية",          labelEn: "Home",           href: "/?noredirect=true" },
  {
    label: "الخدمات", labelEn: "Services", href: "#services",
    children: [
      {
        label: "خدمات الأفراد", labelEn: "Individual Services", href: "#services-individuals",
        children: [
          { label: "عرض خدمات الأفراد",   labelEn: "View individual services", href: "/services/individuals",          icon: "User" },
          { label: "الاستشارات القانونية", labelEn: "Legal Consultations",      href: "/services/consultations",        icon: "ChatCircleDots" },
          { label: "العقود والمستندات",    labelEn: "Contracts & Documents",    href: "/services/contracts",            icon: "FileText" },
          { label: "التمثيل القضائي",      labelEn: "Legal Representation",     href: "/services/legal-representation", icon: "Gavel" },
          { label: "التوثيق الرسمي",       labelEn: "Official Notarization",    href: "/services/notary",               icon: "Stamp" },
        ],
      },
      {
        label: "خدمات الشركات", labelEn: "Business Services", href: "#services-business",
        children: [
          { label: "عرض خدمات الشركات",      labelEn: "View business services", href: "/services/business",                  icon: "Buildings" },
          { label: "تأسيس الشركات",          labelEn: "Company Formation",      href: "/services/business/company-formation", icon: "Storefront" },
          { label: "تسجيل العلامات التجارية", labelEn: "Trademark Registration", href: "/services/business/trademark",         icon: "TrademarkRegistered" },
          { label: "الفحص القانوني الشامل ٣٦٠°", labelEn: "360° Legal Health Check", href: "/services/corporate/health-check", icon: "MagnifyingGlass" },
        ],
      },
      {
        label: "خدمات المحامين", labelEn: "Lawyer Services", href: "#services-lawyers",
        children: [
          { label: "عرض خدمات المحامين", labelEn: "View lawyer services", href: "/services/lawyers", icon: "Gavel" },
          { label: "نظامي ERP",          labelEn: "Nezamy ERP",           href: "/erp",              icon: "Database" },
        ],
      },
      {
        label: "أدوات الذكاء الاصطناعي", labelEn: "AI Tools", href: "#services-ai",
        children: [
          { label: "ذكاء نظامي", labelEn: "Nezamy AI", href: "/ai", icon: "Brain" },
        ],
      },
    ],
  },
  { label: "الاشتراكات",         labelEn: "Pricing",        href: "/pricing" },
  {
    label: "المعرفة القانونية", labelEn: "Legal Knowledge", href: "#knowledge",
    children: [
      { label: "المكتبة القانونية",   labelEn: "Legal Library",     href: "/laws",       icon: "BookOpen" },
      { label: "المجتمع القانوني",  labelEn: "Legal Community", href: "/community",  icon: "ChatCircle" },
      { label: "المدونة القانونية",  labelEn: "Legal Blog",      href: "/blog",      icon: "Article" },
      { label: "ميديا نظامي",       labelEn: "Nezamy Media",     href: "/media",     icon: "PlayCircle", badge: "جديد" },
      { label: "أكاديمية نظامي",    labelEn: "Nezamy Academy",  href: "/academy",   icon: "GraduationCap", badge: "قريباً" },
    ],
  },
];

// ── Lawyer Nav (محامي فرد) ───────────────────────────────────────────────────
export const LAWYER_NAV: NavItem[] = [
  { label: "القضايا",   labelEn: "Cases",     href: "/dashboard/lawyer/cases" },
  { label: "الجلسات",   labelEn: "Hearings",  href: "/dashboard/lawyer/hearings" },
  { label: "العقود",    labelEn: "Contracts", href: "/dashboard/lawyer/contracts" },
  { label: "العملاء",   labelEn: "Clients",   href: "/dashboard/lawyer/clients" },
  { label: "سجل النشاط", labelEn: "Activity Log", href: "/dashboard/lawyer/activity", icon: "Clock" },
  {
    label: "ذكاء نظامي", labelEn: "Nezamy AI", href: "#ai",
    children: [
      { label: "الصائغ القانوني",   labelEn: "Legal Drafter",    href: "/ai/draft",            icon: "PencilSimple" },
      { label: "محترف العقود",       labelEn: "Contract Pro",     href: "/ai/contracts",        icon: "FileText" },
      { label: "المحاكي الشامل",    labelEn: "Litigation Studio", href: "/ai/wargaming",        icon: "Gavel", badge: "مُدمَج" },
      { label: "الرأي الفصل",       labelEn: "Al-Ra'y Al-Fasl",  href: "/ai/legal-opinion",    icon: "Lightbulb", badge: "احترافي" },
      { label: "المرشد القضائي",     labelEn: "Court Guide",      href: "/ai/procedures",       icon: "Gavel" },
      { label: "السكرتير الذكي",     labelEn: "AI Secretary",     href: "/ai/secretary",        icon: "Robot", badge: "قريباً" },
    ],
  },
  { label: "المكتبة القانونية", labelEn: "Legal Library", href: "/laws" },
];

/**
 * l16 (A-14, owner 25 Nov §1.4.1): the INDEPENDENT legal consultant's top
 * bar — the library and the client side of the market only, never the
 * lawyer's pleading or office links. Every href is on the consultant
 * allowlist (consultantScope.ts; navigation.navbar.test.ts fails otherwise).
 */
export const CONSULTANT_NAV: NavItem[] = [
  { label: "لوحة التحكم", labelEn: "Dashboard", href: "/dashboard/lawyer" },
  { label: "المكتبة القانونية", labelEn: "Legal Library", href: "/laws" },
  { label: "مكتبتي", labelEn: "My Library", href: "/laws/my" },
  { label: "اطلب خدمة", labelEn: "Request a service", href: "/marketplace/post" },
  { label: "الباقات", labelEn: "Plans", href: "/pricing" },
];

/**
 * The top bar of a session: the independent consultant (a lawyer session
 * with practice_kind exactly 'consultant' and no active firm membership)
 * gets CONSULTANT_NAV, everyone else getNavByUserType.
 */
export function getNavForSession(userType: UserType, independentConsultant: boolean): NavItem[] {
  return userType === "lawyer" && independentConsultant ? CONSULTANT_NAV : getNavByUserType(userType);
}

// ── Firm Nav (شركة محاماة) ───────────────────────────────────────────────────
export const FIRM_NAV: NavItem[] = [
  { label: "القضايا",   labelEn: "Cases",     href: "/dashboard/firm/cases" },
  { label: "العقود",    labelEn: "Contracts", href: "/dashboard/firm/contracts" },
  { label: "الفريق",    labelEn: "Team",      href: "/dashboard/firm/team" },
  {
    label: "ذكاء نظامي", labelEn: "Nezamy AI", href: "#ai",
    children: [
      { label: "الصائغ القانوني",  labelEn: "Legal Drafter",   href: "/ai/draft",         icon: "PencilSimple" },
      { label: "محترف العقود",      labelEn: "Contract Pro",    href: "/ai/contracts",     icon: "FileText" },
      { label: "مكتبة القوالب",     labelEn: "Templates",       href: "/ai/templates",     icon: "BookmarksSimple", badge: "جديد" },
      { label: "محاكي الخصم",       labelEn: "Wargaming",       href: "/ai/wargaming",     icon: "Sword" },
      { label: "السكرتير الذكي",     labelEn: "AI Secretary",    href: "/ai/secretary",     icon: "Robot", badge: "قريباً" },
      { label: "الرأي القانوني",    labelEn: "Legal Opinion",   href: "/ai/legal-opinion", icon: "Lightbulb" },
      { label: "كل الأدوات...",     labelEn: "All AI Tools",    href: "/ai",               icon: "ArrowLeft" },
    ],
  },
  {
    label: "ERP", labelEn: "ERP", href: "#erp",
    children: [
      { label: "التقارير",          labelEn: "Reports",         href: "/dashboard/firm/analytics",  icon: "ChartBar", badge: "قريباً" },
      { label: "الموارد البشرية",   labelEn: "HR",              href: "/dashboard/firm/team",        icon: "Users" },
      { label: "الماليات",          labelEn: "Finance",         href: "/dashboard/firm/finance",     icon: "Money" },
    ],
  },
  { label: "المكتبة القانونية", labelEn: "Legal Library", href: "/laws" },
];

// ── Individual Nav (عميل فرد) ───────────────────────────────────────────────
export const INDIVIDUAL_NAV: NavItem[] = [
  { label: "لوحة التحكم",  labelEn: "Dashboard",    href: "/dashboard/client" },
  { label: "الخدمات",      labelEn: "Services",     href: "#services",
    // Live check of 13 Nov (row 11): four links here pointed at
    // /dashboard/client/services/{representation,notarization,drafting,hearings},
    // pages that never existed (404). Each link now opens a category the
    // catalogue really sells (CLIENT_SERVICE_CATEGORIES ids), already expanded
    // on the services page; court representation and hearing attendance are
    // not sold, so they are not offered here.
    children: [
      { label: "تحرير دعوى أو مذكرة", labelEn: "Lawsuits & Memos",       href: "/dashboard/client/services?cat=legal-filing", icon: "Gavel" },
      { label: "عقود ووثائق",         labelEn: "Contracts & Documents",  href: "/dashboard/client/services?cat=contracts",    icon: "FileText" },
      { label: "دراسة وتقييم القضية", labelEn: "Case Assessment",        href: "/dashboard/client/services?cat=case-study",   icon: "MagnifyingGlass" },
      { label: "خدمات خاصة",          labelEn: "Special Services",       href: "/dashboard/client/services?cat=special",      icon: "Stamp" },
      { label: "الاستشارات",       labelEn: "Consultations",         href: "/dashboard/client/consultation",           icon: "ChatDots" },
      { label: "كل الخدمات",       labelEn: "All Services",          href: "/dashboard/client/services",               icon: "ArrowLeft" },
    ]
  },
  { label: "قضاياي",        labelEn: "My Cases",     href: "/dashboard/client/cases" },
  { label: "المستندات",     labelEn: "Documents",    href: "/dashboard/client/documents" },
  // The AI hub, not /ai/consult: that page ends at the beta gate's "not
  // available" card (betaGatedRoutes.ts), and the hub lists the tools that
  // work beside it, marked «قريباً» (Wave 1 task 6).
  { label: "ذكاء نظامي",      labelEn: "Nezamy AI",    href: "/ai" },
];

// ── Corporate Nav (شركة) ─────────────────────────────────────────────────────
export const CORPORATE_NAV: NavItem[] = [
  { label: "لوحة التحكم",  labelEn: "Dashboard",    href: "/dashboard/business" },
  { label: "الأقسام",       labelEn: "Departments",  href: "/dashboard/business/departments" },
  { label: "العقود",         labelEn: "Contracts",   href: "/dashboard/business/employee-contracts" },
  {
    label: "أدوات AI", labelEn: "AI Tools", href: "#ai",
    children: [
      // Owner ٤١٧ / ٤٤٣ (8 Nov 2026): «محترف العقود» is a lawyer and firm tool — not in a company's menu.
      { label: "مراقب الامتثال", labelEn: "Compliance",      href: "/ai/corp/compliance-monitor",   icon: "ShieldCheck", badge: "قريباً" },
      { label: "المستشار التجاري",labelEn: "Corp Advisor",    href: "/ai/corp/advisor",      icon: "Buildings", badge: "قريباً" },
      // Owner answer ١١٥ — these three printed canned output and render
      // DashboardComingSoon now; navComingSoon.test.ts does not scan this file,
      // cannedOutputGate.test.ts does.
      { label: "LegalMail",       labelEn: "LegalMail",       href: "/ai/mail-advisor",      icon: "Envelope", badge: "قريباً" },
      { label: "مستشار HR",       labelEn: "HR Advisor",      href: "/ai/corp/hr",           icon: "Users", badge: "قريباً" },
      { label: "المستشار المؤسسي", labelEn: "CorpMind",        href: "/ai/corp/corpmind",     icon: "Robot", badge: "قريباً" },
    ],
  },
  {
    label: "خدمات متقدمة", labelEn: "Advanced Services", href: "#advanced",
    children: [
      { label: "الفحص القانوني ٣٦٠°", labelEn: "Health Check 360°", href: "/dashboard/business/health-check",    icon: "MagnifyingGlass", badge: "جديد" },
      // «قريباً», not «جديد»: the page itself says «قيد التطوير — لم تُطلق بعد».
      { label: "الحوكمة المؤسسية",     labelEn: "Governance",        href: "/services/corporate/governance",      icon: "ShieldCheck", badge: "قريباً" },
      { label: "إرسال للمراجعة",       labelEn: "New Review",        href: "/dashboard/business/reviews/new",     icon: "FileArrowUp" },
      { label: "مراجعات الإدارات",     labelEn: "Dept Reviews",      href: "/dashboard/business/reviews",         icon: "ClipboardText" },
      { label: "المستشار المنتدب",     labelEn: "Seconded Counsel",  href: "/services/corporate/seconded-counsel",icon: "UserCircle" },
    ],
  },
  { label: "التقارير",       labelEn: "Reports",     href: "/dashboard/business/reports" },
];

// ── Micro Nav (منشأة صغيرة) ──────────────────────────────────────────────────
// Simple intentionally — صاحب البقالة لا يريد ١٠ عناصر
export const MICRO_NAV: NavItem[] = [
  { label: "لوحة التحكم",       labelEn: "Dashboard",     href: "/dashboard/micro" },
  { label: "استشارة سريعة",     labelEn: "Quick Consult", href: "/ai/consult", badge: "قريباً" },
  { label: "اشتراطاتي",          labelEn: "My Requirements",href: "/dashboard/micro/requirements" },
  { label: "عقودي",              labelEn: "My Contracts",  href: "/dashboard/micro/contracts" },
];

// ── Provider Nav (مقدم خدمة) ─────────────────────────────────────────────────
export const PROVIDER_NAV: NavItem[] = [
  { label: "الطلبات",      labelEn: "Requests",  href: "/dashboard/provider/requests", badge: "قريباً" },
  { label: "المواعيد",     labelEn: "Calendar",  href: "/dashboard/provider/calendar", badge: "قريباً" },
  { label: "الملف المهني", labelEn: "Profile",   href: "/dashboard/provider/profile", badge: "قريباً" },
  { label: "الأرباح",      labelEn: "Earnings",  href: "/dashboard/provider/earnings", badge: "قريباً" },
];

// ── Admin Nav (مدير النظام) ──────────────────────────────────────────────────
export const ADMIN_NAV: NavItem[] = [
  { label: "نظرة عامة",      labelEn: "Overview",      href: "/dashboard/admin" },
  { label: "المستخدمون",     labelEn: "Users",         href: "/dashboard/admin/users" },
  { label: "الاشتراكات",     labelEn: "Subscriptions", href: "/dashboard/admin/subscriptions" },
  { label: "تذاكر الدعم",    labelEn: "Support",       href: "/dashboard/admin/tickets" },
  { label: "سجل التدقيق",    labelEn: "Audit Log",     href: "/dashboard/admin/audit-log" },
  {
    label: "الإعدادات", labelEn: "Settings", href: "#settings",
    children: [
      // l16 (C19, owner package §٣.٤-1): this row linked the «قريباً» page
      // /dashboard/admin/system (fixed log lines once, DashboardComingSoon
      // since owner ١١٥); it now opens the real platform settings.
      { label: "إعدادات المنصة", labelEn: "Platform Settings", href: "/dashboard/admin/settings", icon: "Gear" },
      { label: "الأمان والصلاحيات", labelEn: "Security",    href: "/dashboard/admin/security", icon: "ShieldCheck" },
    ],
  },
];

// ── Government Nav (جهة حكومية) ──────────────────────────────────────────────
export const GOVERNMENT_NAV: NavItem[] = [
  { label: "لوحة التحكم",   labelEn: "Dashboard",    href: "/dashboard/government" },
  { label: "القضايا",        labelEn: "Cases",        href: "/dashboard/government/cases", badge: "قريباً" },
  { label: "العقود",          labelEn: "Contracts",    href: "/dashboard/government/contracts", badge: "قريباً" },
  { label: "الامتثال",       labelEn: "Compliance",   href: "/dashboard/government/compliance", badge: "قريباً" },
  { label: "التقارير",        labelEn: "Reports",      href: "/dashboard/government/reports", badge: "قريباً" },
  {
    label: "أدوات AI", labelEn: "AI Tools", href: "#ai",
    children: [
      { label: "مراجع العقود الحكومية", labelEn: "Contract Review",    href: "/ai/gov/contract-reviewer",    icon: "FileText", badge: "قريباً" },
      { label: "مدقق الامتثال",         labelEn: "Compliance Checker", href: "/ai/gov/compliance-checker",   icon: "ShieldCheck", badge: "قريباً" },
      { label: "مُرجّح الأحكام",         labelEn: "Judgment Weigher",  href: "/ai/gov/judgment-weigher",     icon: "Gavel", badge: "قريباً" },
      { label: "صائغ لائحة الاتهام",    labelEn: "Indictment Drafter", href: "/ai/gov/indictment-drafter",  icon: "FileWarning", badge: "قريباً" },
      { label: "محاضر الضبط",           labelEn: "Detention Records",  href: "/ai/gov/detention-records",   icon: "ClipboardText", badge: "قريباً" },
      { label: "مراجع المناقصات",        labelEn: "Procurement",        href: "/ai/gov/procurement-reviewer", icon: "Buildings", badge: "قريباً" },
    ],
  },
];

// ── NGO Nav (جمعية خيرية) ────────────────────────────────────────────────────
export const NGO_NAV: NavItem[] = [
  { label: "لوحة التحكم",   labelEn: "Dashboard",   href: "/dashboard/ngo" },
  { label: "المتطوعون",      labelEn: "Volunteers",  href: "/dashboard/ngo/volunteers" },
  { label: "العقود",          labelEn: "Contracts",   href: "/dashboard/ngo/contracts", badge: "قريباً" },
  { label: "الماليات",        labelEn: "Finance",     href: "/dashboard/ngo/finance", badge: "قريباً" },
  { label: "الامتثال",        labelEn: "Compliance",  href: "/dashboard/ngo/compliance" },
  {
    label: "أدوات AI", labelEn: "AI Tools", href: "#ai",
    children: [
      // Owner ٤١٧ / ٤٤٣ (8 Nov 2026): «محترف العقود» is a lawyer and firm tool — not in an NGO's menu.
      { label: "مدقق الحوكمة",       labelEn: "Governance Checker",  href: "/ai/ngo/governance-checker",  icon: "ShieldCheck", badge: "قريباً" },
      { label: "محلل التبرعات",      labelEn: "Donation Analyzer",   href: "/ai/ngo/donation-analyzer",   icon: "ChartBar", badge: "قريباً" },
      { label: "مُعد التقارير",      labelEn: "Report Generator",    href: "/ai/ngo/report-generator",    icon: "FileText", badge: "قريباً" },
    ],
  },
];

/**
 * A nav item renders as a mega menu (item 129) when every child is itself a
 * group of links. A plain link beside the groups would have nowhere to show
 * in the panel, so a mixed list stays an ordinary dropdown.
 */
export function isMegaMenu(item: NavItem): boolean {
  const children = item.children ?? [];
  return children.length > 0 && children.every((child) => (child.children?.length ?? 0) > 0);
}

// ── Helper: get navbar by userType
export function getNavByUserType(userType: UserType): NavItem[] {
  switch (userType) {
    case "admin":      return ADMIN_NAV;
    case "lawyer":     return LAWYER_NAV;
    case "firm":       return FIRM_NAV;
    case "individual": return INDIVIDUAL_NAV;
    case "corporate":  return CORPORATE_NAV;
    case "micro":      return MICRO_NAV;
    case "provider":   return PROVIDER_NAV;
    case "government": return GOVERNMENT_NAV;
    case "ngo":        return NGO_NAV;
    default:           return PUBLIC_NAV;
  }
}
