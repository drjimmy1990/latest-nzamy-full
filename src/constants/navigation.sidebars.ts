import type { AffiliationRole, GovernmentRole, UserType } from "@/hooks/useUser";
import type { SidebarGroup, SidebarItem } from "./navigation.types";
// Relative with `.ts` (and the primary chain below too) so `node --test` can
// load this module — navigation.consultant.test.ts runs getSidebarByUserType.
import { isConsultantBlockedPath, type PracticeKind } from "../lib/auth/practiceKind.ts";
import type { StaffRole } from "../lib/auth/staffRoles.ts";
import { withComingSoonLast, withLiveToolBadges } from "./navigation.comingSoon.ts";
import {
  adminSidebarForRole,
  CORPORATE_SIDEBAR,
  FIRM_SIDEBAR,
  GOVERNMENT_SIDEBAR,
  INDIVIDUAL_SIDEBAR,
  LAWYER_SIDEBAR,
  MICRO_SIDEBAR,
  NGO_SIDEBAR,
  PROVIDER_SIDEBAR,
} from "./navigation.sidebars.primary.ts";

export {
  ADMIN_SIDEBAR,
  adminSidebarForRole,
  CORPORATE_SIDEBAR,
  FIRM_SIDEBAR,
  GOVERNMENT_SIDEBAR,
  INDIVIDUAL_SIDEBAR,
  LAWYER_SIDEBAR,
  MICRO_SIDEBAR,
  NGO_SIDEBAR,
  PROVIDER_SIDEBAR,
} from "./navigation.sidebars.primary.ts";

let BETA_MONOPOLY_MODE = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cfg = require("@/lib/betaConfig");
  BETA_MONOPOLY_MODE = cfg.BETA_MONOPOLY_MODE ?? false;
} catch {
  // betaConfig deleted
}

// ── Government Reviewer / Bailiff Sidebar (مراجع حكومي / معقّب) ──────────────
// provider مع subRole = "bailiff" يحصل على هذا الـ sidebar
export const GOV_REVIEWER_SIDEBAR: SidebarGroup[] = [
  {
    items: [
      { label: "لوحة التحكم",   labelEn: "Overview",     href: "/dashboard/provider",              icon: "SquaresFour", badge: "قريباً" },
    ],
  },
  {
    title: "الطلبات والمعاملات", titleEn: "Requests & Transactions",
    items: [
      { label: "طلبات جديدة",     labelEn: "New Requests",    href: "/dashboard/provider/bailiff/requests",           icon: "Storefront", badge: "قريباً" },
      { label: "معاملات جارية",    labelEn: "In Progress",     href: "/dashboard/provider/bailiff/requests?status=active", icon: "ClipboardText", badge: "قريباً" },
      { label: "معاملات مكتملة",   labelEn: "Completed",       href: "/dashboard/provider/bailiff/requests?status=done",   icon: "CheckCircle", badge: "قريباً" },
      { label: "المواعيد",          labelEn: "Calendar",        href: "/dashboard/provider/calendar",           icon: "CalendarCheck", badge: "قريباً" },
    ],
  },
  {
    title: "ملفي المهني", titleEn: "My Profile",
    items: [
      { label: "الملف المهني",     labelEn: "Profile",      href: "/dashboard/provider/profile",    icon: "UserCircle", badge: "قريباً" },
      { label: "الأرباح",           labelEn: "Earnings",     href: "/dashboard/provider/earnings",   icon: "Money", badge: "قريباً" },
      { label: "التقييمات",         labelEn: "Reviews",      href: "/dashboard/provider/reviews",    icon: "Star", badge: "قريباً" },
    ],
  },
  {
    title: "أدوات المراجع الذكية", titleEn: "Reviewer AI Tools",
    collapsible: true,
    defaultOpen: true,
    items: [
      { label: "مساعد المعاملات",   labelEn: "Transaction Assistant",  href: "/ai/consult",                   icon: "Robot", badge: "قريباً" },
      { label: "دليل الإجراءات",     labelEn: "Procedure Guide",        href: "/ai/procedures",                icon: "MapTrifold" },
      { label: "مراجع الاشتراطات",  labelEn: "Requirements Checker",   href: "/ai/analyze",                   icon: "ShieldCheck", badge: "قريباً" },
      { label: "صياغة تقرير",       labelEn: "Draft Report",           href: "/ai/draft?mode=report",         icon: "FileArrowUp" },
    ],
  },
  {
    title: "سوق الخدمات", titleEn: "Marketplace",
    items: [
      { label: "بروفايلي في السوق",  labelEn: "My Profile",    href: "/marketplace/profile",               icon: "UserCircle" },
      { label: "تصفح الطلبات",       labelEn: "Browse Market", href: "/marketplace",                        icon: "MagnifyingGlass" },
    ],
  },
  {
    items: [
      { label: "الإعدادات",  labelEn: "Settings",      href: "/settings",        icon: "GearSix",  divider: true },
      { label: "الإشعارات",  labelEn: "Notifications", href: "/notifications",   icon: "Bell" },
    ],
  },
];

// ── Arbitrator Sidebar (محكّم مستقل) ──────────────────────────────────────────
// provider مع subRole = "arbitrator" يحصل على هذا الـ sidebar المخصص
export const ARBITRATOR_SIDEBAR: SidebarGroup[] = [
  {
    items: [
      { label: "نظرة عامة",      labelEn: "Overview",   href: "/dashboard/provider",                        icon: "SquaresFour", badge: "قريباً" },
    ],
  },
  {
    title: "قضايا التحكيم", titleEn: "Arbitration Cases",
    items: [
      { label: "كل القضايا",       labelEn: "All Cases",      href: "/dashboard/provider/arbitration/cases",    icon: "Scales",        badge: "قريباً" },
      { label: "جلسات التحكيم",   labelEn: "Hearings",       href: "/dashboard/provider/arbitration/hearings",  icon: "CalendarCheck", badge: "قريباً" },
      { label: "الأطراف والوكلاء",labelEn: "Parties",        href: "/dashboard/provider/arbitration/parties",   icon: "Users", badge: "قريباً" },
      { label: "مذكرات وملفات",   labelEn: "Memos & Files",  href: "/dashboard/provider/arbitration/files",     icon: "FolderOpen", badge: "قريباً" },
    ],
  },
  {
    title: "الأحكام والقرارات", titleEn: "Awards & Decisions",
    items: [
      { label: "أحكامي الصادرة",   labelEn: "Issued Awards",  href: "/dashboard/provider/arbitration/awards",    icon: "Gavel", badge: "قريباً" },
      { label: "مسودات الأحكام",  labelEn: "Draft Awards",   href: "/dashboard/provider/arbitration/drafts",    icon: "PencilSimple", badge: "قريباً" },
    ],
  },
  {
    title: "أدوات AI للمحكّم", titleEn: "Arbitrator AI Tools",
    collapsible: true,
    defaultOpen: true,
    items: [
      { label: "صائغ حكم التحكيم",  labelEn: "Award Drafter",      href: "/ai/draft?mode=arbitration",  icon: "Robot",          badge: "AI" },
      { label: "ملخّص المذكرات",     labelEn: "Memo Summarizer",    href: "/ai/analyze?mode=memo",       icon: "Scan", badge: "قريباً" },
      { label: "باحث المبادئ",       labelEn: "Principle Search",   href: "/ai/gov/judicial-search",     icon: "MagnifyingGlass", badge: "قريباً" },
      { label: "مدقق الاختصاص",     labelEn: "Jurisdiction Check", href: "/ai/gov/jurisdiction-analyzer",icon: "TreeStructure", badge: "قريباً" },
      { label: "مستشار القانون الدولي",labelEn: "Intl. Law Advisor",href: "/ai/consult?ctx=arbitration", icon: "Globe", badge: "قريباً" },
    ],
  },
  {
    title: "ملفي المهني", titleEn: "My Profile",
    items: [
      { label: "الملف المهني",    labelEn: "Profile",    href: "/dashboard/provider/profile",  icon: "UserCircle", badge: "قريباً" },
      { label: "الأرباح والأتعاب",labelEn: "Earnings",   href: "/dashboard/provider/earnings", icon: "Money", badge: "قريباً" },
      { label: "التقييمات",       labelEn: "Reviews",    href: "/dashboard/provider/reviews",  icon: "Star", badge: "قريباً" },
    ],
  },
  {
    title: "سوق التحكيم", titleEn: "Arbitration Market",
    items: [
      { label: "طلبات تحكيم جديدة", labelEn: "New Requests", href: "/marketplace?category=arbitration", icon: "Storefront", badge: "جديد" },
      { label: "تصفح النزاعات",      labelEn: "Browse",       href: "/marketplace",                     icon: "MagnifyingGlass" },
    ],
  },
  {
    items: [
      { label: "الإعدادات",  labelEn: "Settings",      href: "/settings",       icon: "GearSix",  divider: true },
      { label: "الإشعارات",  labelEn: "Notifications", href: "/notifications",  icon: "Bell" },
    ],
  },
];

// ─── Multi-Role Addon Sections ────────────────────────────────────────────────
// تُضاف ديناميكياً للـ sidebar الأساسي عندما يكون active_roles محدداً
// القاعدة: الأقوى أولاً — نضيف فقط الأدوات الفريدة غير الموجودة أصلاً

/** أدوات التوثيق — تظهر للمحامي+الموثّق فقط */
export const NOTARY_ADDON_SECTIONS: SidebarGroup[] = [
  {
    title: "خدمات التوثيق", titleEn: "Notary Services",
    collapsible: true,
    defaultOpen: false,   // مطوية بالافتراضي — الأدوات الأساسية للموثق فقط
    items: [
      { label: "طلبات التوثيق",    labelEn: "Notary Requests",    href: "/dashboard/provider/notary/requests",  icon: "Stamp",        badge: "قريباً" },
      { label: "مسودات التوثيق",   labelEn: "Notary Drafts",      href: "/dashboard/provider/notary/drafts",   icon: "PencilSimple",  badge: "قريباً" },
      { label: "صائغ عقد التوثيق",labelEn: "Notary Drafter",    href: "/ai/draft?mode=notary",                icon: "Robot",         badge: "AI" },
    ],
  },
];

/** أدوات التعقيب — تظهر للمحامي+المراجع فقط */
export const BAILIFF_ADDON_SECTIONS: SidebarGroup[] = [
  {
    title: "خدمات التعقيب", titleEn: "Review Services",
    collapsible: true,
    defaultOpen: false,   // مطوية بالافتراضي — الأدوات الأساسية للمراجع فقط
    items: [
      { label: "طلبات التعقيب",     labelEn: "Review Requests",    href: "/dashboard/provider/bailiff/requests",   icon: "ClipboardText", badge: "قريباً" },
      { label: "مساعد المعاملات",   labelEn: "Transaction Assist", href: "/ai/consult",                            icon: "Robot",         badge: "قريباً" },
      { label: "دليل الإجراءات",    labelEn: "Procedure Guide",    href: "/ai/procedures",                         icon: "MapTrifold",    badge: "معقّب" },
    ],
  },
];

/** أدوات التحكيم — تظهر للمحامي+المحكّم أو مقدم خدمة+محكّم فقط */
export const ARBITRATOR_ADDON_SECTIONS: SidebarGroup[] = [
  {
    title: "التحكيم", titleEn: "Arbitration",
    collapsible: true,
    defaultOpen: false,   // مطوية بالافتراضي — تفتحها عند الحاجة
    items: [
      { label: "قضايا التحكيم",     labelEn: "Arb. Cases",        href: "/dashboard/provider/arbitration/cases",    icon: "Scales",       badge: "قريباً" },
      { label: "جلسات التحكيم",    labelEn: "Arb. Hearings",     href: "/dashboard/provider/arbitration/hearings", icon: "CalendarCheck",  badge: "قريباً" },
      { label: "صياغة حكم تحكيم",   labelEn: "Draft Arb. Award",  href: "/ai/draft?mode=arbitration",                icon: "Robot",         badge: "AI" },
    ],
  },
];

// ─── Sidebar Merge Utility ────────────────────────────────────────────────────
/**
 * mergeAddonSections — يدمج أقسام الأدوار الإضافية قبل قسم الإعدادات الأخير.
 * نبحث عن آخر group فيه href="/settings" ونحشر الـ addons قبله.
 */
function mergeAddonSections(
  base: SidebarGroup[],
  addons: SidebarGroup[],
): SidebarGroup[] {
  if (!addons.length) return base;

  // 1. الأولوية الأولى: حشر الأدوات بعد قسم "العملاء" أو "Clients" مباشرة ليكون ظاهراً للمحامي
  const clientsIdx = base.findIndex((g) => g.title === "العملاء" || g.titleEn === "Clients");
  if (clientsIdx !== -1) {
    return [
      ...base.slice(0, clientsIdx + 1),
      ...addons,
      ...base.slice(clientsIdx + 1),
    ];
  }

  // 2. إذا لم يجد "العملاء"، يبحث عن الإعدادات
  const settingsIdx = base.findLastIndex(
    (g) => g.items.some((item) => item.href === "/settings"),
  );
  if (settingsIdx !== -1) {
    return [
      ...base.slice(0, settingsIdx),
      ...addons,
      ...base.slice(settingsIdx),
    ];
  }

  // 3. الحل الأخير: إضافتها في النهاية
  return [...base, ...addons];
}

// ── Helper: get sidebar by userType + subRole + active_roles
const GOVERNMENT_ROLE_TOOL_SECTION: Record<GovernmentRole, string> = {
  judge: "Judge Tools",
  prosecutor: "Prosecutor Tools",
  officer: "Officer Tools",
  gov_counsel: "Counsel Tools",
};

const GOVERNMENT_ROLE_TOOL_SECTIONS = new Set(Object.values(GOVERNMENT_ROLE_TOOL_SECTION));

const GOVERNMENT_ROLE_LEGAL_ITEMS: Record<GovernmentRole, string[]> = {
  judge: ["Cases", "Reports"],
  prosecutor: ["Cases", "Reports"],
  officer: ["Reports"],
  gov_counsel: ["Cases", "Contracts", "Compliance", "Counsel", "Reports"],
};

function getGovernmentSidebar(governmentRole?: GovernmentRole | null): SidebarGroup[] {
  const role = governmentRole ?? "gov_counsel";
  const allowedToolSection = GOVERNMENT_ROLE_TOOL_SECTION[role];
  const allowedLegalItems = new Set(GOVERNMENT_ROLE_LEGAL_ITEMS[role]);

  return GOVERNMENT_SIDEBAR
    .filter((group) => {
      if (!group.titleEn || !GOVERNMENT_ROLE_TOOL_SECTIONS.has(group.titleEn)) return true;
      return group.titleEn === allowedToolSection;
    })
    .map((group) => {
      if (group.titleEn !== "Legal Management") return group;
      return {
        ...group,
        items: group.items.filter((item) => allowedLegalItems.has(item.labelEn)),
      };
    });
}

function filterSidebarByLabels(groups: SidebarGroup[], allowedLabels: Set<string>): SidebarGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowedLabels.has(item.labelEn)),
    }))
    .filter((group) => group.items.length > 0);
}

// ── Corporate Sidebar Filter ──────────────────────────────────────────────────
//
// 2026-08-27 — "Request a Service" / "My Orders" / "Consultations" were added
// to seven of the nine lists: the same seven as BUSINESS_REQUEST_ROLES in
// src/constants/entityRouteAccess.ts, which is the set already trusted to raise
// a request and to open the company document vault. The two left out are
// `seconded` and `compliance_officer` — an external seconded counsel and a
// compliance officer are not the company's purchasers, exactly as they are not
// its document custodians.
//
// "My Orders" and not "My Requests": this map is keyed on labelEn, and
// "My Requests" already means «طلباتي في السوق» (the marketplace section) in
// four of these lists. Reusing the string would silently re-open a section the
// 26 August ruling closed.
const CORP_ROLE_ALLOWED_ITEMS: Record<string, string[]> = {
  owner: ["Overview", "Company Data", "Delegations", "Company Contracts", "Appointments", "Request a Service", "My Orders", "Consultations", "All Cases", "Circuits & Emails", "Departments", "Team", "Kanban", "HR Contracts", "Reports", "Our Plan", "Contract Drafter", "Deal Intelligence", "Corp Advisor", "Compliance", "Risk Assessment", "Debt Collection", "LegalMail", "HR Advisor", "CorpMind", "Law Monitor", "Doc Analyzer", "Health Check 360°", "Governance", "Governance Matrix", "New Review", "Dept Reviews", "Seconded Counsel", "My Requests", "Browse Market", "Post Request", "Legal Blog", "Notifications", "Settings"],
  legal_manager: ["Overview", "Company Data", "Delegations", "Company Contracts", "Appointments", "Request a Service", "My Orders", "Consultations", "All Cases", "Circuits & Emails", "Departments", "Kanban", "Contract Drafter", "Corp Advisor", "Compliance", "Risk Assessment", "LegalMail", "CorpMind", "Law Monitor", "Doc Analyzer", "Health Check 360°", "Governance", "Governance Matrix", "New Review", "Dept Reviews", "Seconded Counsel", "Browse Market", "Legal Blog", "Notifications", "Settings"],
  legal_staff: ["Overview", "Company Data", "Delegations", "Company Contracts", "Appointments", "Request a Service", "My Orders", "Consultations", "All Cases", "Circuits & Emails", "Kanban", "Contract Drafter", "LegalMail", "Doc Analyzer", "New Review", "Dept Reviews", "Legal Blog", "Notifications", "Settings"],
  department_head: ["Overview", "Company Data", "Delegations", "Company Contracts", "Request a Service", "My Orders", "Consultations", "Departments", "Kanban", "Contract Drafter", "New Review", "Dept Reviews", "My Requests", "Notifications", "Settings"],
  hr_manager: ["Overview", "Company Data", "Delegations", "Company Contracts", "Request a Service", "My Orders", "Consultations", "Team", "Kanban", "HR Contracts", "Reports", "HR Advisor", "CorpMind", "My Requests", "Notifications", "Settings"],
  finance_manager: ["Overview", "Company Data", "Delegations", "Company Contracts", "Request a Service", "My Orders", "Consultations", "Reports", "Our Plan", "Deal Intelligence", "Debt Collection", "My Requests", "Notifications", "Settings"],
  compliance_officer: ["Overview", "Company Data", "Delegations", "Company Contracts", "Appointments", "All Cases", "Reports", "Compliance", "Risk Assessment", "Law Monitor", "Doc Analyzer", "Health Check 360°", "Governance", "Governance Matrix", "Dept Reviews", "Legal Blog", "Notifications", "Settings"],
  seconded: ["Overview", "Company Data", "Delegations", "Company Contracts", "Appointments", "All Cases", "Seconded Counsel", "Contract Drafter", "Doc Analyzer", "Notifications", "Settings"],
  employee: ["Overview", "Company Data", "Delegations", "Company Contracts", "Request a Service", "My Orders", "Consultations", "Kanban", "My Requests", "Notifications", "Settings"],
};

function getCorporateSidebar(businessRole?: string | null): SidebarGroup[] {
  const role = businessRole ?? "owner";
  // owner sees everything
  if (role === "owner") return CORPORATE_SIDEBAR;
  
  const allowedItems = new Set(CORP_ROLE_ALLOWED_ITEMS[role] || CORP_ROLE_ALLOWED_ITEMS["employee"]);
  return filterSidebarByLabels(CORPORATE_SIDEBAR, allowedItems);
}

// ── Law Firm Sidebar Filter ──────────────────────────────────────────────────
//
// N06-28/29 (owner package 13 Nov): these lists used to name rows by labelEn.
// A row renamed in FIRM_SIDEBAR («فاحص المستندات» "Doc Analyzer" and «الموجز
// القضائي» "ParaLegal (AI Briefing)" became one «عصارة المرفقات» row,
// "Attachment Analyzer") silently vanished for every role whose list kept the
// old English string. They now name rows by href — the key the sidebar already
// renders rows by (SidebarComponents.tsx `key={item.href}`) — and
// navigation.firmRoles.test.ts fails on any href that matches no FIRM_SIDEBAR row.
// Roles that listed either old analyzer name keep /ai/analyze. legal_consultant
// and in_house_counsel listed «مراجع العقود», a 301 to /ai/contracts (N06-26
// removed that duplicate row), so they keep /ai/contracts instead.
export const FIRM_ROLE_ALLOWED_HREFS: Record<AffiliationRole | "default", readonly string[]> = {
  managing_partner: ["/dashboard/firm", "/dashboard/firm/cases", "/dashboard/firm/graph", "/dashboard/firm/hearings", "/dashboard/firm/cases/assign", "/dashboard/firm/tasks", "/dashboard/firm/activity", "/dashboard/firm/contracts", "/dashboard/firm/templates", "/dashboard/firm/documents", "/dashboard/firm/archive", "/dashboard/firm/clients", "/dashboard/firm/consultations", "/dashboard/firm/client-portal", "/dashboard/firm/team", "/dashboard/firm/team/roles", "/dashboard/firm/team/timesheets", "/dashboard/firm/team/trainees", "/dashboard/firm/team/attendance", "/dashboard/firm/achievements", "/dashboard/firm/departments", "/dashboard/firm/branches", "/dashboard/firm/departments/permissions", "/dashboard/firm/compliance/kyc", "/dashboard/firm/compliance/walls", "/dashboard/firm/health-check", "/dashboard/firm/governance", "/dashboard/firm/governance?tab=matrix", "/dashboard/firm/finance", "/dashboard/firm/fees", "/dashboard/firm/finance/reports", "/dashboard/firm/analytics", "/ai/analyze", "/ai/quick-answer", "/ai/draft", "/ai/collector", "/ai/contracts", "/ai/contract-drafter", "/ai/communicate", "/ai/brief-check", "/ai/analyze-strength", "/ai/contract-negotiator", "/ai/legal-opinion", "/ai/najiz-optimizer", "/ai/wargaming", "/ai/procedures", "/ai/monitor", "/ai/secretary", "/ai/fee-calculator", "/ai/report-generator", "/ai/direction-support", "/ai/legal-translate", "/ai/transcriber", "/ai/compare", "/dashboard/firm/circuits-emails", "/dashboard/firm/of-counsel", "/dashboard/firm/secondment/new", "/dashboard/firm/shared-rooms", "/dashboard/firm/marketplace", "/marketplace", "/marketplace/post", "/marketplace/collaborate", "/dashboard/firm/profile", "/community", "/blog", "/laws", "/academy", "/notifications", "/settings"],
  partner: ["/dashboard/firm", "/dashboard/firm/cases", "/dashboard/firm/graph", "/dashboard/firm/hearings", "/dashboard/firm/cases/assign", "/dashboard/firm/tasks", "/dashboard/firm/activity", "/dashboard/firm/contracts", "/dashboard/firm/templates", "/dashboard/firm/documents", "/dashboard/firm/archive", "/dashboard/firm/clients", "/dashboard/firm/consultations", "/dashboard/firm/client-portal", "/dashboard/firm/team/timesheets", "/dashboard/firm/departments", "/dashboard/firm/compliance/kyc", "/dashboard/firm/health-check", "/dashboard/firm/governance", "/dashboard/firm/finance", "/dashboard/firm/finance/reports", "/dashboard/firm/analytics", "/ai/analyze", "/ai/quick-answer", "/ai/draft", "/ai/collector", "/ai/contracts", "/ai/contract-drafter", "/ai/communicate", "/ai/brief-check", "/ai/analyze-strength", "/ai/contract-negotiator", "/ai/legal-opinion", "/ai/najiz-optimizer", "/ai/wargaming", "/ai/procedures", "/ai/monitor", "/ai/secretary", "/ai/fee-calculator", "/ai/report-generator", "/dashboard/firm/circuits-emails", "/dashboard/firm/of-counsel", "/dashboard/firm/shared-rooms", "/dashboard/firm/marketplace", "/marketplace", "/dashboard/firm/profile", "/community", "/blog", "/laws", "/academy", "/notifications", "/settings"],
  senior_lawyer: ["/dashboard/firm", "/dashboard/firm/cases", "/dashboard/firm/graph", "/dashboard/firm/hearings", "/dashboard/firm/tasks", "/dashboard/firm/activity", "/dashboard/firm/contracts", "/dashboard/firm/templates", "/dashboard/firm/documents", "/dashboard/firm/archive", "/dashboard/firm/clients", "/dashboard/firm/consultations", "/dashboard/firm/compliance/kyc", "/ai/analyze", "/ai/quick-answer", "/ai/draft", "/ai/collector", "/ai/contracts", "/ai/contract-drafter", "/ai/communicate", "/ai/brief-check", "/ai/analyze-strength", "/ai/contract-negotiator", "/ai/legal-opinion", "/ai/najiz-optimizer", "/ai/wargaming", "/ai/procedures", "/ai/monitor", "/ai/secretary", "/ai/fee-calculator", "/ai/direction-support", "/ai/legal-translate", "/ai/transcriber", "/ai/compare", "/dashboard/firm/circuits-emails", "/dashboard/firm/shared-rooms", "/dashboard/firm/marketplace", "/marketplace", "/blog", "/laws", "/academy", "/notifications", "/settings"],
  lawyer: ["/dashboard/firm", "/dashboard/firm/cases", "/dashboard/firm/graph", "/dashboard/firm/hearings", "/dashboard/firm/tasks", "/dashboard/firm/contracts", "/dashboard/firm/templates", "/dashboard/firm/documents", "/dashboard/firm/archive", "/dashboard/firm/clients", "/dashboard/firm/consultations", "/ai/analyze", "/ai/quick-answer", "/ai/draft", "/ai/contracts", "/ai/contract-drafter", "/ai/communicate", "/ai/brief-check", "/ai/procedures", "/ai/secretary", "/ai/fee-calculator", "/ai/direction-support", "/ai/legal-translate", "/ai/compare", "/dashboard/firm/circuits-emails", "/dashboard/firm/shared-rooms", "/blog", "/laws", "/academy", "/notifications", "/settings"],
  legal_consultant: ["/dashboard/firm", "/dashboard/firm/cases", "/dashboard/firm/graph", "/dashboard/firm/tasks", "/dashboard/firm/contracts", "/dashboard/firm/documents", "/dashboard/firm/clients", "/dashboard/firm/consultations", "/ai/quick-answer", "/ai/draft", "/ai/contracts", "/ai/contract-drafter", "/ai/communicate", "/ai/analyze", "/laws", "/notifications", "/settings"],
  in_house_counsel: ["/dashboard/firm", "/dashboard/firm/cases", "/dashboard/firm/graph", "/dashboard/firm/tasks", "/dashboard/firm/contracts", "/dashboard/firm/documents", "/dashboard/firm/clients", "/dashboard/firm/consultations", "/ai/quick-answer", "/ai/draft", "/ai/contracts", "/ai/contract-drafter", "/ai/communicate", "/ai/analyze", "/laws", "/notifications", "/settings"],
  trainee: ["/dashboard/firm", "/dashboard/firm/hearings", "/dashboard/firm/tasks", "/dashboard/firm/templates", "/dashboard/firm/documents", "/dashboard/firm/archive", "/ai/quick-answer", "/ai/draft", "/ai/procedures", "/ai/fee-calculator", "/laws", "/academy", "/notifications", "/settings"],
  legal_secretary: ["/dashboard/firm", "/dashboard/firm/graph", "/dashboard/firm/hearings", "/dashboard/firm/tasks", "/dashboard/firm/activity", "/dashboard/firm/templates", "/dashboard/firm/documents", "/dashboard/firm/archive", "/dashboard/firm/clients", "/dashboard/firm/consultations", "/ai/secretary", "/ai/transcriber", "/dashboard/firm/circuits-emails", "/notifications", "/settings"],
  office_admin: ["/dashboard/firm", "/dashboard/firm/cases/assign", "/dashboard/firm/tasks", "/dashboard/firm/activity", "/dashboard/firm/vault?tab=branding", "/dashboard/firm/clients", "/dashboard/firm/consultations", "/dashboard/firm/team", "/dashboard/firm/team/roles", "/dashboard/firm/team/timesheets", "/dashboard/firm/team/trainees", "/dashboard/firm/team/attendance", "/dashboard/firm/achievements", "/dashboard/firm/departments", "/dashboard/firm/branches", "/dashboard/firm/profile", "/notifications", "/settings"],
  finance_manager: ["/dashboard/firm", "/dashboard/firm/clients", "/dashboard/firm/finance", "/dashboard/firm/fees", "/dashboard/firm/finance/reports", "/dashboard/firm/analytics", "/ai/fee-calculator", "/ai/report-generator", "/notifications", "/settings"],
  hr_manager: ["/dashboard/firm", "/dashboard/firm/team", "/dashboard/firm/team/timesheets", "/dashboard/firm/team/trainees", "/dashboard/firm/team/attendance", "/dashboard/firm/achievements", "/ai/report-generator", "/notifications", "/settings"],
  compliance_manager: ["/dashboard/firm", "/dashboard/firm/cases", "/dashboard/firm/graph", "/dashboard/firm/activity", "/dashboard/firm/documents", "/dashboard/firm/compliance/kyc", "/dashboard/firm/compliance/walls", "/dashboard/firm/health-check", "/dashboard/firm/governance", "/dashboard/firm/governance?tab=matrix", "/ai/monitor", "/ai/report-generator", "/laws", "/notifications", "/settings"],
  external_of_counsel: ["/dashboard/firm", "/dashboard/firm/cases", "/dashboard/firm/graph", "/dashboard/firm/tasks", "/dashboard/firm/documents", "/dashboard/firm/shared-rooms", "/ai/quick-answer", "/ai/draft", "/ai/analyze", "/laws", "/notifications", "/settings"],
  default: ["/dashboard/firm", "/dashboard/firm/cases", "/dashboard/firm/hearings", "/dashboard/firm/tasks", "/dashboard/firm/contracts", "/dashboard/firm/documents", "/dashboard/firm/clients", "/dashboard/firm/consultations", "/ai/quick-answer", "/ai/draft", "/ai/contracts", "/ai/contract-drafter", "/ai/communicate", "/ai/analyze", "/laws", "/notifications", "/settings"],
};

function filterSidebarByHrefs(groups: SidebarGroup[], allowedHrefs: ReadonlySet<string>): SidebarGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowedHrefs.has(item.href)),
    }))
    .filter((group) => group.items.length > 0);
}

function getFirmSidebar(affiliationRole?: AffiliationRole | null): SidebarGroup[] {
  const role = affiliationRole ?? "managing_partner";
  if (role === "managing_partner") return FIRM_SIDEBAR;

  const allowedHrefs = new Set(FIRM_ROLE_ALLOWED_HREFS[role] ?? FIRM_ROLE_ALLOWED_HREFS.default);
  return filterSidebarByHrefs(FIRM_SIDEBAR, allowedHrefs);
}

/**
 * Art. 18 of نظام المحاماة (owner ١٧٣ / ٢١٩): an independent legal consultant
 * may not plead or manage hearings. Drops every item — and every child — whose
 * href is on CONSULTANT_BLOCKED_PREFIXES, then any group this filter emptied.
 * The list itself lives in practiceKind.ts, shared with the page locks and the
 * server-side refusal.
 */
export function withoutConsultantBlockedItems(groups: SidebarGroup[]): SidebarGroup[] {
  const keep = (items: SidebarItem[]): SidebarItem[] =>
    items
      .filter((item) => !isConsultantBlockedPath(item.href))
      .map((item) => (item.children ? { ...item, children: keep(item.children) } : item));
  return groups.flatMap((group) => {
    const items = keep(group.items);
    return items.length === 0 && group.items.length > 0 ? [] : [{ ...group, items }];
  });
}

export function getSidebarByUserType(
  userType: UserType,
  /**
   * Owner ٢٦٤ (2026-10-25): the «مبسّطة / كاملة» toggle is gone and every
   * sidebar is the full one. This slot stays only to keep the positions of
   * the arguments after it (subRole is a string too, so dropping it would
   * silently bind a caller's "full" to subRole). Its value is ignored — a
   * stale "light" left in preferences or display_mode gets the full list.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- see the doc comment
  _dashboardMode: "light" | "full" = "full",
  subRole?: string | null,
  activeRoles?: string[],
  governmentRole?: GovernmentRole | null,
  businessRole?: string | null,
  affiliationRole?: AffiliationRole | null,
  isDemoBypass: boolean = false,
  country?: string | null,
  /** lawyer_profiles.practice_kind; read for lawyers only, ignored for every other type. */
  practiceKind?: PracticeKind | null,
  /**
   * Owner ٢١٠: an admin's staff role (useUser().staffRole); read for admins
   * only. Null or absent keeps today's full admin sidebar — the server
   * enforces the real rule.
   */
  staffRole?: StaffRole | null,
  /**
   * BUG-12: registry tools tool-status confirmed open for this user
   * (useLiveTools). Their rows lose «قريباً» before the lawyer menu moves
   * «قريباً» rows into their own section. Absent = every badge as written.
   */
  liveTools?: ReadonlySet<string> | null,
): SidebarGroup[] {
  const isConsultant = userType === "lawyer" && practiceKind === "consultant";

  // Arbitrator: provider with subRole = "arbitrator" gets a fully dedicated sidebar
  if (userType === "provider" && subRole === "arbitrator") return ARBITRATOR_SIDEBAR;

  // Bailiff/Gov Reviewer: provider with subRole = "bailiff" gets a dedicated sidebar
  if (userType === "provider" && subRole === "bailiff") return GOV_REVIEWER_SIDEBAR;

  let base: SidebarGroup[];
  switch (userType) {
    case "admin":      base = adminSidebarForRole(staffRole); break;
    case "lawyer": {
      base = LAWYER_SIDEBAR;
      if (country === "SA") {
        base = base.map(group => {
          if (group.title === "ذكاء نظامي" || group.titleEn === "Nezamy AI") {
            return {
              ...group,
              items: [
                ...group.items,
                { label: "القضاء والتشريع المقارن", labelEn: "Comparative Law", href: "/ai/global", icon: "Globe", badge: "قريباً" }
              ]
            };
          }
          return group;
        });
      }
      break;
    }
    case "firm": {
      base = getFirmSidebar(affiliationRole);
      if (country === "SA") {
        base = base.map(group => {
          if (group.title === "ذكاء نظامي" || group.titleEn === "Nezamy AI") {
            return {
              ...group,
              items: [
                ...group.items,
                { label: "القضاء والتشريع المقارن", labelEn: "Comparative Law", href: "/ai/global", icon: "Globe", badge: "قريباً" }
              ]
            };
          }
          return group;
        });
      }
      break;
    }
    case "individual": {
      if (country && country !== "SA") {
        base = INDIVIDUAL_SIDEBAR.map(group => {
          if (group.title === "ذكاء نظامي" || group.titleEn === "Nezamy AI") {
            // Default of owner Q172 (2026-10-04): «الاستشارة» stays — /ai/global
            // is coming-soon (Q154), so replacing the consult with it left
            // non-Saudi individuals no way to ask. It is listed beside it.
            return {
              ...group,
              items: [
                ...group.items,
                { label: "القضاء والتشريع المقارن", labelEn: "Comparative Law", href: "/ai/global", icon: "Globe", badge: "قريباً" },
              ],
            };
          }
          return group;
        });
      } else {
        base = INDIVIDUAL_SIDEBAR;
      }
      break;
    }
    case "corporate":  base = getCorporateSidebar(businessRole); break;
    case "micro":      base = MICRO_SIDEBAR; break;
    case "provider":   base = PROVIDER_SIDEBAR; break;
    case "government": base = getGovernmentSidebar(governmentRole); break;
    case "ngo":        base = NGO_SIDEBAR; break;
    default:           return [];
  }

  // ── Multi-Role Merge ──────────────────────────────────────────────────────
  // لو المستخدم عنده active_roles، ندمج الأقسام الفريدة من كل دور إضافي
  // K1 Fix: Prevent Lawyer roles from bleeding into Corporate UI
  if (activeRoles && activeRoles.length > 0 && userType !== "corporate") {
    const addons: SidebarGroup[] = [];
    if (activeRoles.includes("notary"))      addons.push(...NOTARY_ADDON_SECTIONS);
    if (activeRoles.includes("bailiff"))     addons.push(...BAILIFF_ADDON_SECTIONS);
    if (activeRoles.includes("arbitrator"))  addons.push(...ARBITRATOR_ADDON_SECTIONS);
    if (addons.length) base = mergeAddonSections(base, addons);
  }

  // ── Beta Monopoly Mode Filtering ──────────────────────────────────────────
  // Hides public/unpromoted pages from the sidebars unless bypassed
  if (BETA_MONOPOLY_MODE && !isDemoBypass) {
    const hiddenHrefs = [
      "/marketplace",
      "/marketplace/post",
      "/marketplace/collaborate",
      "/marketplace/my-requests",
      "/marketplace?tab=my-requests",
      "/marketplace/profile",
      "/dashboard/lawyer/marketplace",
      "/dashboard/firm/marketplace",
      "/dashboard/business/marketplace",
      "/dashboard/provider/requests",
      "/services/lawyers",
      // "/community/lawyers" was listed here. Owner item ١٤٦ repointed both
      // legal sidebars at /community, so this string now matches no item and
      // keeping it would hide nothing. It is deliberately NOT rewritten to
      // "/community": the individual client has linked «المجتمع القانوني» →
      // /community all along (navigation.sidebars.primary.ts), so putting that
      // href in this list would take the community away from the one account
      // type that already had it — a regression dressed up as a rename.
      // Lawyers and firms now reach the same real forum on the same terms.
    ];

    base = base.map(group => ({
      ...group,
      items: group.items.filter(item => !hiddenHrefs.includes(item.href))
    })).filter(group => group.items.length > 0);
  }

  // ── Owner UX08 (2026-10-30): «قريباً» rows in their own last section ─────
  // The lawyer menu only. Same rows, same badges — only where they sit.
  base = withLiveToolBadges(base, liveTools);
  if (userType === "lawyer") base = withComingSoonLast(base);

  // ── Art. 18: the consultant's sidebar has no pleading or hearings tools ───
  // Last, so it also covers anything the multi-role merge above added.
  if (isConsultant) base = withoutConsultantBlockedItems(base);

  return base;
}
