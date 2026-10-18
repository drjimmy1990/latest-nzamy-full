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
          { label: "عرض خدمات المحامين", labelEn: "View lawyer services", href: "/services/lawyers", icon: "Scales" },
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
      { label: "أكاديمية نظامي",    labelEn: "Nezamy Academy",  href: "/academy",   icon: "GraduationCap", badge: "جديد" },
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
      { label: "المحاكي الشامل",    labelEn: "Litigation Studio", href: "/ai/wargaming",        icon: "Scales", badge: "مُدمَج" },
      { label: "الرأي الفصل",       labelEn: "Al-Ra'y Al-Fasl",  href: "/ai/legal-opinion",    icon: "Lightbulb", badge: "PRO" },
      { label: "المرشد القضائي",     labelEn: "Court Guide",      href: "/ai/procedures",       icon: "Gavel" },
      { label: "السكرتير الذكي",     labelEn: "AI Secretary",     href: "/ai/secretary",        icon: "Robot", badge: "قريباً" },
    ],
  },
  { label: "المكتبة القانونية", labelEn: "Legal Library", href: "/laws" },
];

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
      { label: "التقارير",          labelEn: "Reports",         href: "/dashboard/firm/analytics",  icon: "ChartBar" },
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
    children: [
      { label: "التمثيل القضائي", labelEn: "Court Representation", href: "/dashboard/client/services/representation", icon: "Gavel" },
      { label: "التوثيق الرسمي",  labelEn: "Official Notarization", href: "/dashboard/client/services/notarization", icon: "Stamp" },
      { label: "صياغة المذكرات",   labelEn: "Memo Drafting",         href: "/dashboard/client/services/drafting",      icon: "PencilSimple" },
      { label: "حضور الجلسات",     labelEn: "Attend Hearings",       href: "/dashboard/client/services/hearings",      icon: "CalendarCheck" },
      { label: "الاستشارات",       labelEn: "Consultations",         href: "/dashboard/client/consultation",           icon: "ChatDots" },
      { label: "كل الخدمات",       labelEn: "All Services",          href: "/dashboard/client/services",               icon: "ArrowLeft" },
    ]
  },
  { label: "قضاياي",        labelEn: "My Cases",     href: "/dashboard/client/cases" },
  { label: "المستندات",     labelEn: "Documents",    href: "/dashboard/client/documents" },
  { label: "ذكاء نظامي",      labelEn: "Nezamy AI",    href: "/ai/consult" },
];

// ── Corporate Nav (شركة) ─────────────────────────────────────────────────────
export const CORPORATE_NAV: NavItem[] = [
  { label: "لوحة التحكم",  labelEn: "Dashboard",    href: "/dashboard/business" },
  { label: "الأقسام",       labelEn: "Departments",  href: "/dashboard/business/departments" },
  { label: "العقود",         labelEn: "Contracts",   href: "/dashboard/business/employee-contracts" },
  {
    label: "أدوات AI", labelEn: "AI Tools", href: "#ai",
    children: [
      { label: "محترف العقود",    labelEn: "Contract Pro",    href: "/ai/contracts",         icon: "FileText" },
      { label: "مراقب الامتثال", labelEn: "Compliance",      href: "/ai/corp/compliance-monitor",   icon: "ShieldCheck" },
      { label: "المستشار التجاري",labelEn: "Corp Advisor",    href: "/ai/corp/advisor",      icon: "Buildings" },
      // Owner answer ١١٥ — these three printed canned output and render
      // DashboardComingSoon now; navComingSoon.test.ts does not scan this file,
      // cannedOutputGate.test.ts does.
      { label: "LegalMail",       labelEn: "LegalMail",       href: "/ai/mail-advisor",      icon: "Envelope", badge: "قريباً" },
      { label: "مستشار HR",       labelEn: "HR Advisor",      href: "/ai/corp/hr",           icon: "Users", badge: "قريباً" },
      { label: "CorpMind",        labelEn: "CorpMind",        href: "/ai/corp/corpmind",     icon: "Robot", badge: "قريباً" },
    ],
  },
  {
    label: "خدمات متقدمة", labelEn: "Advanced Services", href: "#advanced",
    children: [
      { label: "الفحص القانوني ٣٦٠°", labelEn: "Health Check 360°", href: "/dashboard/business/health-check",    icon: "MagnifyingGlass", badge: "جديد" },
      { label: "الحوكمة المؤسسية",     labelEn: "Governance",        href: "/services/corporate/governance",      icon: "ShieldCheck", badge: "جديد" },
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
  { label: "استشارة سريعة",     labelEn: "Quick Consult", href: "/ai/consult" },
  { label: "اشتراطاتي",          labelEn: "My Requirements",href: "/dashboard/micro/requirements" },
  { label: "عقودي",              labelEn: "My Contracts",  href: "/dashboard/micro/contracts" },
];

// ── Provider Nav (مقدم خدمة) ─────────────────────────────────────────────────
export const PROVIDER_NAV: NavItem[] = [
  { label: "الطلبات",      labelEn: "Requests",  href: "/dashboard/provider/requests" },
  { label: "المواعيد",     labelEn: "Calendar",  href: "/dashboard/provider/calendar" },
  { label: "الملف المهني", labelEn: "Profile",   href: "/dashboard/provider/profile" },
  { label: "الأرباح",      labelEn: "Earnings",  href: "/dashboard/provider/earnings" },
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
      // «قريباً» (owner ١١٥): the page showed fixed log lines and renders
      // DashboardComingSoon now.
      { label: "إعدادات النظام", labelEn: "System Settings", href: "/dashboard/admin/system",   icon: "Gear", badge: "قريباً" },
      { label: "الأمان والصلاحيات", labelEn: "Security",    href: "/dashboard/admin/security", icon: "ShieldCheck" },
    ],
  },
];

// ── Government Nav (جهة حكومية) ──────────────────────────────────────────────
export const GOVERNMENT_NAV: NavItem[] = [
  { label: "لوحة التحكم",   labelEn: "Dashboard",    href: "/dashboard/government" },
  { label: "القضايا",        labelEn: "Cases",        href: "/dashboard/government/cases" },
  { label: "العقود",          labelEn: "Contracts",    href: "/dashboard/government/contracts" },
  { label: "الامتثال",       labelEn: "Compliance",   href: "/dashboard/government/compliance" },
  { label: "التقارير",        labelEn: "Reports",      href: "/dashboard/government/reports" },
  {
    label: "أدوات AI", labelEn: "AI Tools", href: "#ai",
    children: [
      { label: "مراجع العقود الحكومية", labelEn: "Contract Review",    href: "/ai/gov/contract-reviewer",    icon: "FileText" },
      { label: "مدقق الامتثال",         labelEn: "Compliance Checker", href: "/ai/gov/compliance-checker",   icon: "ShieldCheck" },
      { label: "مُرجّح الأحكام",         labelEn: "Judgment Weigher",  href: "/ai/gov/judgment-weigher",     icon: "Scales", badge: "قاضي" },
      { label: "صائغ لائحة الاتهام",    labelEn: "Indictment Drafter", href: "/ai/gov/indictment-drafter",  icon: "FileWarning", badge: "نيابة" },
      { label: "محاضر الضبط",           labelEn: "Detention Records",  href: "/ai/gov/detention-records",   icon: "ClipboardText", badge: "ضابط" },
      { label: "مراجع المناقصات",        labelEn: "Procurement",        href: "/ai/gov/procurement-reviewer", icon: "Buildings", badge: "مستشار" },
    ],
  },
];

// ── NGO Nav (جمعية خيرية) ────────────────────────────────────────────────────
export const NGO_NAV: NavItem[] = [
  { label: "لوحة التحكم",   labelEn: "Dashboard",   href: "/dashboard/ngo" },
  { label: "المتطوعون",      labelEn: "Volunteers",  href: "/dashboard/ngo/volunteers" },
  { label: "العقود",          labelEn: "Contracts",   href: "/dashboard/ngo/contracts" },
  { label: "الماليات",        labelEn: "Finance",     href: "/dashboard/ngo/finance" },
  { label: "الامتثال",        labelEn: "Compliance",  href: "/dashboard/ngo/compliance" },
  {
    label: "أدوات AI", labelEn: "AI Tools", href: "#ai",
    children: [
      { label: "صائغ عقود التطوع",  labelEn: "Volunteer Contract",  href: "/ai/ngo/volunteer-contract",  icon: "HandHeart" },
      { label: "مدقق الحوكمة",       labelEn: "Governance Checker",  href: "/ai/ngo/governance-checker",  icon: "ShieldCheck" },
      { label: "محلل التبرعات",      labelEn: "Donation Analyzer",   href: "/ai/ngo/donation-analyzer",   icon: "ChartBar" },
      { label: "مُعد التقارير",      labelEn: "Report Generator",    href: "/ai/ngo/report-generator",    icon: "FileText" },
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
