import type { AffiliationRole, GovernmentRole, UserType } from "@/hooks/useUser";
import type { SidebarGroup } from "./navigation.types";
import {
  ADMIN_SIDEBAR,
  CORPORATE_SIDEBAR,
  FIRM_SIDEBAR,
  FIRM_SIDEBAR_LITE,
  GOVERNMENT_SIDEBAR,
  INDIVIDUAL_SIDEBAR,
  LAWYER_SIDEBAR,
  LAWYER_SIDEBAR_LITE,
  MICRO_SIDEBAR,
  NGO_SIDEBAR,
  PROVIDER_SIDEBAR,
} from "./navigation.sidebars.primary";

export {
  ADMIN_SIDEBAR,
  CORPORATE_SIDEBAR,
  FIRM_SIDEBAR,
  FIRM_SIDEBAR_LITE,
  GOVERNMENT_SIDEBAR,
  INDIVIDUAL_SIDEBAR,
  LAWYER_SIDEBAR,
  LAWYER_SIDEBAR_LITE,
  MICRO_SIDEBAR,
  NGO_SIDEBAR,
  PROVIDER_SIDEBAR,
} from "./navigation.sidebars.primary";

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
      { label: "لوحة التحكم",   labelEn: "Overview",     href: "/dashboard/provider",              icon: "SquaresFour" },
    ],
  },
  {
    title: "الطلبات والمعاملات", titleEn: "Requests & Transactions",
    items: [
      { label: "طلبات جديدة",     labelEn: "New Requests",    href: "/dashboard/provider/bailiff/requests",           icon: "Storefront", badge: "جديد" },
      { label: "معاملات جارية",    labelEn: "In Progress",     href: "/dashboard/provider/bailiff/requests?status=active", icon: "ClipboardText" },
      { label: "معاملات مكتملة",   labelEn: "Completed",       href: "/dashboard/provider/bailiff/requests?status=done",   icon: "CheckCircle" },
      { label: "المواعيد",          labelEn: "Calendar",        href: "/dashboard/provider/calendar",           icon: "CalendarCheck" },
    ],
  },
  {
    title: "ملفي المهني", titleEn: "My Profile",
    items: [
      { label: "الملف المهني",     labelEn: "Profile",      href: "/dashboard/provider/profile",    icon: "UserCircle" },
      { label: "الأرباح",           labelEn: "Earnings",     href: "/dashboard/provider/earnings",   icon: "Money" },
      { label: "التقييمات",         labelEn: "Reviews",      href: "/dashboard/provider/reviews",    icon: "Star" },
    ],
  },
  {
    title: "أدوات المراجع الذكية", titleEn: "Reviewer AI Tools",
    collapsible: true,
    defaultOpen: true,
    items: [
      { label: "مساعد المعاملات",   labelEn: "Transaction Assistant",  href: "/ai/consult",                   icon: "Robot" },
      { label: "دليل الإجراءات",     labelEn: "Procedure Guide",        href: "/ai/procedures",                icon: "MapTrifold" },
      { label: "مراجع الاشتراطات",  labelEn: "Requirements Checker",   href: "/ai/analyze",                   icon: "ShieldCheck" },
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
      { label: "نظرة عامة",      labelEn: "Overview",   href: "/dashboard/provider",                        icon: "SquaresFour" },
    ],
  },
  {
    title: "قضايا التحكيم", titleEn: "Arbitration Cases",
    items: [
      { label: "كل القضايا",       labelEn: "All Cases",      href: "/dashboard/provider/arbitration/cases",    icon: "Scales",        badge: "جديد" },
      { label: "جلسات التحكيم",   labelEn: "Hearings",       href: "/dashboard/provider/arbitration/hearings",  icon: "CalendarCheck" },
      { label: "الأطراف والوكلاء",labelEn: "Parties",        href: "/dashboard/provider/arbitration/parties",   icon: "Users" },
      { label: "مذكرات وملفات",   labelEn: "Memos & Files",  href: "/dashboard/provider/arbitration/files",     icon: "FolderOpen" },
    ],
  },
  {
    title: "الأحكام والقرارات", titleEn: "Awards & Decisions",
    items: [
      { label: "أحكامي الصادرة",   labelEn: "Issued Awards",  href: "/dashboard/provider/arbitration/awards",    icon: "Gavel" },
      { label: "مسودات الأحكام",  labelEn: "Draft Awards",   href: "/dashboard/provider/arbitration/drafts",    icon: "PencilSimple" },
    ],
  },
  {
    title: "أدوات AI للمحكّم", titleEn: "Arbitrator AI Tools",
    collapsible: true,
    defaultOpen: true,
    items: [
      { label: "صائغ حكم التحكيم",  labelEn: "Award Drafter",      href: "/ai/draft?mode=arbitration",  icon: "Robot",          badge: "AI" },
      { label: "ملخّص المذكرات",     labelEn: "Memo Summarizer",    href: "/ai/analyze?mode=memo",       icon: "Scan" },
      { label: "باحث المبادئ",       labelEn: "Principle Search",   href: "/ai/gov/judicial-search",     icon: "MagnifyingGlass" },
      { label: "مدقق الاختصاص",     labelEn: "Jurisdiction Check", href: "/ai/gov/jurisdiction-analyzer",icon: "TreeStructure" },
      { label: "مستشار القانون الدولي",labelEn: "Intl. Law Advisor",href: "/ai/consult?ctx=arbitration", icon: "Globe" },
    ],
  },
  {
    title: "ملفي المهني", titleEn: "My Profile",
    items: [
      { label: "الملف المهني",    labelEn: "Profile",    href: "/dashboard/provider/profile",  icon: "UserCircle" },
      { label: "الأرباح والأتعاب",labelEn: "Earnings",   href: "/dashboard/provider/earnings", icon: "Money" },
      { label: "التقييمات",       labelEn: "Reviews",    href: "/dashboard/provider/reviews",  icon: "Star" },
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
      { label: "طلبات التوثيق",    labelEn: "Notary Requests",    href: "/dashboard/provider/notary/requests",  icon: "Stamp",        badge: "موثّق" },
      { label: "مسودات التوثيق",   labelEn: "Notary Drafts",      href: "/dashboard/provider/notary/drafts",   icon: "PencilSimple",  badge: "موثّق" },
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
      { label: "طلبات التعقيب",     labelEn: "Review Requests",    href: "/dashboard/provider/bailiff/requests",   icon: "ClipboardText", badge: "معقّب" },
      { label: "مساعد المعاملات",   labelEn: "Transaction Assist", href: "/ai/consult",                            icon: "Robot",         badge: "AI" },
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
      { label: "قضايا التحكيم",     labelEn: "Arb. Cases",        href: "/dashboard/provider/arbitration/cases",    icon: "Scales",       badge: "محكّم" },
      { label: "جلسات التحكيم",    labelEn: "Arb. Hearings",     href: "/dashboard/provider/arbitration/hearings", icon: "CalendarCheck",  badge: "محكّم" },
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

// ── Helper: get sidebar by userType + dashboardMode + subRole + active_roles
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
const CORP_ROLE_ALLOWED_ITEMS: Record<string, string[]> = {
  owner: ["Overview", "All Cases", "Circuits & Emails", "Departments", "Team", "Kanban", "HR Contracts", "Reports", "Our Plan", "Contract Drafter", "Deal Intelligence", "Corp Advisor", "Compliance", "Risk Assessment", "Debt Collection", "LegalMail", "HR Advisor", "CorpMind", "Law Monitor", "Doc Analyzer", "Health Check 360°", "Governance", "Governance Matrix", "New Review", "Dept Reviews", "Seconded Counsel", "My Requests", "Browse Market", "Post Request", "Legal Blog", "Notifications", "Settings"],
  legal_manager: ["Overview", "All Cases", "Circuits & Emails", "Departments", "Kanban", "Contract Drafter", "Corp Advisor", "Compliance", "Risk Assessment", "LegalMail", "CorpMind", "Law Monitor", "Doc Analyzer", "Health Check 360°", "Governance", "Governance Matrix", "New Review", "Dept Reviews", "Seconded Counsel", "Browse Market", "Legal Blog", "Notifications", "Settings"],
  legal_staff: ["Overview", "All Cases", "Circuits & Emails", "Kanban", "Contract Drafter", "LegalMail", "Doc Analyzer", "New Review", "Dept Reviews", "Legal Blog", "Notifications", "Settings"],
  department_head: ["Overview", "Departments", "Kanban", "Contract Drafter", "New Review", "Dept Reviews", "My Requests", "Notifications", "Settings"],
  hr_manager: ["Overview", "Team", "Kanban", "HR Contracts", "Reports", "HR Advisor", "CorpMind", "My Requests", "Notifications", "Settings"],
  finance_manager: ["Overview", "Reports", "Our Plan", "Deal Intelligence", "Debt Collection", "My Requests", "Notifications", "Settings"],
  compliance_officer: ["Overview", "All Cases", "Reports", "Compliance", "Risk Assessment", "Law Monitor", "Doc Analyzer", "Health Check 360°", "Governance", "Governance Matrix", "Dept Reviews", "Legal Blog", "Notifications", "Settings"],
  seconded: ["Overview", "All Cases", "Seconded Counsel", "Contract Drafter", "Doc Analyzer", "Notifications", "Settings"],
  employee: ["Overview", "Kanban", "My Requests", "Notifications", "Settings"],
};

function getCorporateSidebar(businessRole?: string | null): SidebarGroup[] {
  const role = businessRole ?? "owner";
  // owner sees everything
  if (role === "owner") return CORPORATE_SIDEBAR;
  
  const allowedItems = new Set(CORP_ROLE_ALLOWED_ITEMS[role] || CORP_ROLE_ALLOWED_ITEMS["employee"]);
  return filterSidebarByLabels(CORPORATE_SIDEBAR, allowedItems);
}

// ── Law Firm Sidebar Filter ──────────────────────────────────────────────────
const FIRM_ROLE_ALLOWED_ITEMS: Record<AffiliationRole | "default", string[]> = {
  managing_partner: ["Overview", "All Cases", "Hearings", "Assignments", "Team Tasks", "Activity Log", "Contract Manager", "Templates", "Documents", "Unified Archive", "Clients", "Consultations", "Client Portal", "Branding", "Team", "Roles", "Timesheets", "Trainees", "Attendance", "Achievements", "Manage Departments", "Firm Branches", "Dept Permissions", "Conflict Check", "Client KYC", "Chinese Walls", "Health Check 360°", "Governance", "Governance Matrix", "Revenue", "Fees", "Reports", "Analytics", "ParaLegal (AI Briefing)", "Quick Legal Q&A", "Legal Drafter", "Research Collector", "Contract Pro", "Contract Negotiator", "Contract Reviewer", "Al-Ra'y Al-Fasl", "Najiz Optimizer", "Litigation Studio", "Doc Analyzer", "Court Guide", "Law Monitor", "AI Secretary", "Legal Calculator", "Report Generator", "Business Advisor", "Contract Lifecycle", "Compliance Monitor", "HR Advisor", "Direction Support", "Legal Translator", "Transcriber", "Smart Comparator", "Circuits & Emails", "Of-Counsel", "Post Secondment", "Shared Rooms", "My Requests", "Browse Market", "Post Request", "Collaborate", "Legal Vault", "Firm Profile", "Legal Community", "Legal Blog", "Legal Library", "Nezamy Academy", "Notifications", "Settings"],
  partner: ["Overview", "All Cases", "Hearings", "Assignments", "Team Tasks", "Activity Log", "Contract Manager", "Templates", "Documents", "Unified Archive", "Clients", "Consultations", "Client Portal", "Timesheets", "Manage Departments", "Conflict Check", "Client KYC", "Health Check 360°", "Governance", "Revenue", "Reports", "Analytics", "ParaLegal (AI Briefing)", "Quick Legal Q&A", "Legal Drafter", "Research Collector", "Contract Pro", "Contract Negotiator", "Contract Reviewer", "Al-Ra'y Al-Fasl", "Najiz Optimizer", "Litigation Studio", "Doc Analyzer", "Court Guide", "Law Monitor", "AI Secretary", "Legal Calculator", "Report Generator", "Circuits & Emails", "Of-Counsel", "Shared Rooms", "My Requests", "Browse Market", "Legal Vault", "Firm Profile", "Legal Community", "Legal Blog", "Legal Library", "Nezamy Academy", "Notifications", "Settings"],
  senior_lawyer: ["Overview", "All Cases", "Hearings", "Team Tasks", "Activity Log", "Contract Manager", "Templates", "Documents", "Unified Archive", "Clients", "Consultations", "Conflict Check", "Client KYC", "ParaLegal (AI Briefing)", "Quick Legal Q&A", "Legal Drafter", "Research Collector", "Contract Pro", "Contract Negotiator", "Contract Reviewer", "Al-Ra'y Al-Fasl", "Najiz Optimizer", "Litigation Studio", "Doc Analyzer", "Court Guide", "Law Monitor", "AI Secretary", "Legal Calculator", "Direction Support", "Legal Translator", "Transcriber", "Smart Comparator", "Circuits & Emails", "Shared Rooms", "My Requests", "Browse Market", "Legal Vault", "Legal Blog", "Legal Library", "Nezamy Academy", "Notifications", "Settings"],
  lawyer: ["Overview", "All Cases", "Hearings", "Team Tasks", "Contract Manager", "Templates", "Documents", "Unified Archive", "Clients", "Consultations", "Conflict Check", "ParaLegal (AI Briefing)", "Quick Legal Q&A", "Legal Drafter", "Contract Pro", "Contract Reviewer", "Doc Analyzer", "Court Guide", "AI Secretary", "Legal Calculator", "Direction Support", "Legal Translator", "Smart Comparator", "Circuits & Emails", "Shared Rooms", "Legal Blog", "Legal Library", "Nezamy Academy", "Notifications", "Settings"],
  legal_consultant: ["Overview", "All Cases", "Team Tasks", "Contract Manager", "Documents", "Clients", "Consultations", "Conflict Check", "Quick Legal Q&A", "Legal Drafter", "Contract Reviewer", "Doc Analyzer", "Legal Library", "Notifications", "Settings"],
  in_house_counsel: ["Overview", "All Cases", "Team Tasks", "Contract Manager", "Documents", "Clients", "Consultations", "Conflict Check", "Quick Legal Q&A", "Legal Drafter", "Contract Reviewer", "Doc Analyzer", "Legal Library", "Notifications", "Settings"],
  trainee: ["Overview", "Hearings", "Team Tasks", "Templates", "Documents", "Unified Archive", "Quick Legal Q&A", "Legal Drafter", "Court Guide", "Legal Calculator", "Legal Library", "Nezamy Academy", "Notifications", "Settings"],
  legal_secretary: ["Overview", "Hearings", "Team Tasks", "Activity Log", "Templates", "Documents", "Unified Archive", "Clients", "Consultations", "AI Secretary", "Transcriber", "Circuits & Emails", "Notifications", "Settings"],
  office_admin: ["Overview", "Hearings", "Assignments", "Team Tasks", "Activity Log", "Clients", "Consultations", "Team", "Roles", "Timesheets", "Trainees", "Attendance", "Achievements", "Manage Departments", "Firm Branches", "Firm Profile", "Notifications", "Settings"],
  finance_manager: ["Overview", "Clients", "Revenue", "Fees", "Reports", "Analytics", "Legal Calculator", "Report Generator", "Notifications", "Settings"],
  hr_manager: ["Overview", "Team", "Timesheets", "Trainees", "Attendance", "Achievements", "HR Advisor", "Report Generator", "Notifications", "Settings"],
  compliance_manager: ["Overview", "All Cases", "Activity Log", "Documents", "Conflict Check", "Client KYC", "Chinese Walls", "Health Check 360°", "Governance", "Governance Matrix", "Compliance Monitor", "Law Monitor", "Report Generator", "Legal Library", "Notifications", "Settings"],
  external_of_counsel: ["Overview", "All Cases", "Hearings", "Team Tasks", "Documents", "Shared Rooms", "Quick Legal Q&A", "Legal Drafter", "Doc Analyzer", "Legal Library", "Notifications", "Settings"],
  default: ["Overview", "All Cases", "Hearings", "Team Tasks", "Contract Manager", "Documents", "Clients", "Consultations", "Quick Legal Q&A", "Legal Drafter", "Contract Pro", "Doc Analyzer", "Legal Library", "Notifications", "Settings"],
};

function getFirmSidebar(
  affiliationRole?: AffiliationRole | null,
  dashboardMode: "light" | "full" = "full",
): SidebarGroup[] {
  const role = affiliationRole ?? "managing_partner";
  const source = dashboardMode === "light" ? FIRM_SIDEBAR_LITE : FIRM_SIDEBAR;
  if (role === "managing_partner" && dashboardMode === "full") return FIRM_SIDEBAR;

  const allowedItems = new Set(FIRM_ROLE_ALLOWED_ITEMS[role] ?? FIRM_ROLE_ALLOWED_ITEMS.default);
  return filterSidebarByLabels(source, allowedItems);
}

export function getSidebarByUserType(
  userType: UserType,
  dashboardMode: "light" | "full" = "full",
  subRole?: string | null,
  activeRoles?: string[],
  governmentRole?: GovernmentRole | null,
  businessRole?: string | null,
  affiliationRole?: AffiliationRole | null,
  isDemoBypass: boolean = false,
  country?: string | null,
): SidebarGroup[] {
  // Arbitrator: provider with subRole = "arbitrator" gets a fully dedicated sidebar
  if (userType === "provider" && subRole === "arbitrator") return ARBITRATOR_SIDEBAR;

  // Bailiff/Gov Reviewer: provider with subRole = "bailiff" gets a dedicated sidebar
  if (userType === "provider" && subRole === "bailiff") return GOV_REVIEWER_SIDEBAR;

  // Lite mode: return stripped-down sidebars for lawyers & firms
  if (dashboardMode === "light") {
    if (userType === "lawyer") return LAWYER_SIDEBAR_LITE;
    if (userType === "firm") return getFirmSidebar(affiliationRole, "light");
  }

  let base: SidebarGroup[];
  switch (userType) {
    case "admin":      base = ADMIN_SIDEBAR; break;
    case "lawyer": {
      base = LAWYER_SIDEBAR;
      if (country === "SA") {
        base = base.map(group => {
          if (group.title === "نظامي AI" || group.titleEn === "Nezamy AI") {
            return {
              ...group,
              items: [
                ...group.items,
                { label: "نظامي عالمي", labelEn: "Nezamy Global", href: "/ai/global", icon: "Globe" }
              ]
            };
          }
          return group;
        });
      }
      break;
    }
    case "firm": {
      base = getFirmSidebar(affiliationRole, dashboardMode);
      if (country === "SA") {
        base = base.map(group => {
          if (group.title === "نظامي AI" || group.titleEn === "Nezamy AI") {
            return {
              ...group,
              items: [
                ...group.items,
                { label: "نظامي عالمي", labelEn: "Nezamy Global", href: "/ai/global", icon: "Globe" }
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
          if (group.title === "نظامي AI" || group.titleEn === "Nzamy AI") {
            return {
              ...group,
              items: group.items.map(item => {
                if (item.href === "/ai/consult") {
                  return {
                    label: "نظامي عالمي",
                    labelEn: "Nezamy Global",
                    href: "/ai/global",
                    icon: "Globe",
                  };
                }
                return item;
              })
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
      "/community/lawyers",
    ];

    base = base.map(group => ({
      ...group,
      items: group.items.filter(item => !hiddenHrefs.includes(item.href))
    })).filter(group => group.items.length > 0);
  }

  return base;
}
