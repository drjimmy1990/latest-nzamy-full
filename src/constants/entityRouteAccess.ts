import type { AffiliationRole, BusinessRole } from "@/hooks/useUser";

type Rule<T extends string> = {
  path: string;
  match: "exact" | "prefix";
  label: string;
  allowedRoles: readonly T[];
};

export type EntityRouteDecision<T extends string> = {
  allowed: boolean;
  label?: string;
  allowedRoles?: readonly T[];
};

const ALL_BUSINESS_ROLES = [
  "owner",
  "legal_manager",
  "legal_staff",
  "compliance_officer",
  "seconded",
  "department_head",
  "hr_manager",
  "finance_manager",
  "employee",
] as const satisfies readonly BusinessRole[];

const BUSINESS_CASE_ROLES = ["owner", "legal_manager", "legal_staff", "compliance_officer", "seconded"] as const;
const BUSINESS_REQUEST_ROLES = ["owner", "legal_manager", "legal_staff", "department_head", "hr_manager", "finance_manager", "employee"] as const;

export const BUSINESS_ROUTE_RULES: readonly Rule<BusinessRole>[] = [
  { path: "/dashboard/business", match: "exact", label: "لوحة الشركة", allowedRoles: ALL_BUSINESS_ROLES },
  { path: "/dashboard/business/cases/new", match: "prefix", label: "إنشاء قضية", allowedRoles: ["owner", "legal_manager", "seconded"] },
  { path: "/dashboard/business/cases", match: "prefix", label: "القضايا والنزاعات", allowedRoles: BUSINESS_CASE_ROLES },
  { path: "/dashboard/business/hearings", match: "prefix", label: "الجلسات", allowedRoles: ["owner", "legal_manager", "legal_staff", "seconded"] },
  { path: "/dashboard/business/circuits-emails", match: "prefix", label: "الدوائر والإيميلات", allowedRoles: ["owner", "legal_manager", "legal_staff", "seconded"] },
  { path: "/dashboard/business/departments", match: "prefix", label: "الأقسام", allowedRoles: ["owner", "legal_manager", "department_head"] },
  { path: "/dashboard/business/team", match: "prefix", label: "الفريق والدعوات", allowedRoles: ["owner", "legal_manager", "hr_manager"] },
  { path: "/dashboard/business/employee-contracts", match: "prefix", label: "عقود الموظفين", allowedRoles: ["owner", "legal_manager", "hr_manager"] },
  { path: "/dashboard/business/reports", match: "prefix", label: "التقارير", allowedRoles: ["owner", "legal_manager", "compliance_officer", "hr_manager", "finance_manager"] },
  { path: "/dashboard/business/wallet", match: "prefix", label: "الفوترة والمحفظة", allowedRoles: ["owner", "finance_manager"] },
  { path: "/dashboard/business/governance", match: "prefix", label: "الحوكمة", allowedRoles: ["owner", "legal_manager", "compliance_officer"] },
  { path: "/dashboard/business/health-check", match: "prefix", label: "الفحص القانوني 360", allowedRoles: ["owner", "legal_manager", "compliance_officer"] },
  { path: "/dashboard/business/seconded-counsel", match: "prefix", label: "المستشار المنتدب", allowedRoles: ["owner", "legal_manager"] },
  { path: "/dashboard/business/marketplace", match: "prefix", label: "سوق الخدمات", allowedRoles: ["owner", "legal_manager"] },
  { path: "/dashboard/business/reviews/new", match: "prefix", label: "طلب مراجعة", allowedRoles: BUSINESS_REQUEST_ROLES },
  { path: "/dashboard/business/reviews", match: "prefix", label: "مراجعات الأقسام", allowedRoles: ["owner", "legal_manager", "legal_staff", "compliance_officer", "department_head", "seconded"] },
  { path: "/dashboard/business/requests", match: "prefix", label: "طلبات الشركة", allowedRoles: ALL_BUSINESS_ROLES },
  { path: "/dashboard/business/consultations", match: "prefix", label: "استشارات الشركة", allowedRoles: ALL_BUSINESS_ROLES },
  { path: "/dashboard/business/kanban", match: "prefix", label: "لوحة المهام", allowedRoles: ["owner", "legal_manager", "legal_staff", "department_head", "hr_manager", "employee"] },
  { path: "/dashboard/business/procedures-expert", match: "prefix", label: "المرشد القضائي", allowedRoles: BUSINESS_CASE_ROLES },
];

const ALL_FIRM_ROLES = [
  "managing_partner",
  "partner",
  "senior_lawyer",
  "lawyer",
  "trainee",
  "legal_secretary",
  "office_admin",
  "finance_manager",
  "hr_manager",
  "compliance_manager",
  "external_of_counsel",
  "legal_consultant",
  "in_house_counsel",
] as const satisfies readonly AffiliationRole[];

const FIRM_LEGAL_ROLES = ["managing_partner", "partner", "senior_lawyer", "lawyer", "legal_consultant", "in_house_counsel", "external_of_counsel"] as const;
const FIRM_CASE_VIEW_ROLES = [...FIRM_LEGAL_ROLES, "legal_secretary", "compliance_manager"] as const;
const FIRM_TEAM_ADMIN_ROLES = ["managing_partner", "office_admin", "hr_manager"] as const;
const FIRM_BILLING_ROLES = ["managing_partner", "partner", "finance_manager", "office_admin"] as const;

export const FIRM_ROUTE_RULES: readonly Rule<AffiliationRole>[] = [
  { path: "/dashboard/firm", match: "exact", label: "لوحة المكتب", allowedRoles: ALL_FIRM_ROLES },
  { path: "/dashboard/firm/cases/assign", match: "prefix", label: "توزيع القضايا", allowedRoles: ["managing_partner", "partner", "senior_lawyer"] },
  { path: "/dashboard/firm/cases", match: "prefix", label: "قضايا المكتب", allowedRoles: FIRM_CASE_VIEW_ROLES },
  { path: "/dashboard/firm/hearings", match: "prefix", label: "جلسات المكتب", allowedRoles: [...FIRM_LEGAL_ROLES, "trainee", "legal_secretary"] },
  { path: "/dashboard/firm/tasks", match: "prefix", label: "مهام الفريق", allowedRoles: [...FIRM_LEGAL_ROLES, "trainee", "legal_secretary"] },
  { path: "/dashboard/firm/activity", match: "prefix", label: "سجل النشاط", allowedRoles: ["managing_partner", "partner", "senior_lawyer", "legal_secretary", "office_admin", "compliance_manager"] },
  { path: "/dashboard/firm/contracts", match: "prefix", label: "العقود", allowedRoles: [...FIRM_LEGAL_ROLES, "legal_secretary"] },
  { path: "/dashboard/firm/templates", match: "prefix", label: "النماذج", allowedRoles: [...FIRM_LEGAL_ROLES, "trainee", "legal_secretary"] },
  { path: "/dashboard/firm/documents", match: "prefix", label: "المستندات", allowedRoles: [...FIRM_CASE_VIEW_ROLES, "trainee"] },
  { path: "/dashboard/firm/archive", match: "prefix", label: "الأرشيف", allowedRoles: [...FIRM_CASE_VIEW_ROLES, "trainee"] },
  { path: "/dashboard/firm/clients", match: "prefix", label: "العملاء", allowedRoles: [...FIRM_LEGAL_ROLES, "legal_secretary", "office_admin", "finance_manager"] },
  { path: "/dashboard/firm/consultations", match: "prefix", label: "الاستشارات", allowedRoles: [...FIRM_LEGAL_ROLES, "legal_secretary", "office_admin"] },
  { path: "/dashboard/firm/client-portal", match: "prefix", label: "بوابة العميل", allowedRoles: ["managing_partner", "partner", "office_admin"] },
  { path: "/dashboard/firm/branding", match: "prefix", label: "هوية البوابة", allowedRoles: ["managing_partner", "office_admin"] },
  { path: "/dashboard/firm/team/roles", match: "prefix", label: "الأدوار والصلاحيات", allowedRoles: ["managing_partner", "office_admin"] },
  { path: "/dashboard/firm/team/timesheets", match: "prefix", label: "سجلات الساعات", allowedRoles: [...FIRM_TEAM_ADMIN_ROLES, "partner", "senior_lawyer"] },
  { path: "/dashboard/firm/team", match: "prefix", label: "فريق المكتب", allowedRoles: FIRM_TEAM_ADMIN_ROLES },
  { path: "/dashboard/firm/departments/permissions", match: "prefix", label: "صلاحيات الأقسام", allowedRoles: ["managing_partner", "office_admin", "compliance_manager"] },
  { path: "/dashboard/firm/departments", match: "prefix", label: "أقسام الممارسة", allowedRoles: ["managing_partner", "partner", "office_admin", "compliance_manager"] },
  { path: "/dashboard/firm/branches", match: "prefix", label: "فروع المكتب", allowedRoles: ["managing_partner", "office_admin"] },
  { path: "/dashboard/firm/compliance/walls", match: "prefix", label: "الجدران الصينية", allowedRoles: ["managing_partner", "compliance_manager"] },
  { path: "/dashboard/firm/compliance", match: "prefix", label: "الامتثال", allowedRoles: [...FIRM_LEGAL_ROLES, "compliance_manager"] },
  { path: "/dashboard/firm/governance", match: "prefix", label: "الحوكمة", allowedRoles: ["managing_partner", "partner", "senior_lawyer", "compliance_manager"] },
  { path: "/dashboard/firm/health-check", match: "prefix", label: "الفحص الشامل", allowedRoles: ["managing_partner", "partner", "senior_lawyer", "compliance_manager"] },
  { path: "/dashboard/firm/finance", match: "prefix", label: "مالية المكتب", allowedRoles: FIRM_BILLING_ROLES },
  { path: "/dashboard/firm/fees", match: "prefix", label: "الأتعاب", allowedRoles: FIRM_BILLING_ROLES },
  { path: "/dashboard/firm/wallet", match: "prefix", label: "محفظة المكتب", allowedRoles: FIRM_BILLING_ROLES },
  { path: "/dashboard/firm/analytics", match: "prefix", label: "التحليلات", allowedRoles: ["managing_partner", "partner", "senior_lawyer", "finance_manager", "hr_manager", "compliance_manager"] },
  { path: "/dashboard/firm/achievements", match: "prefix", label: "الإنجازات", allowedRoles: FIRM_TEAM_ADMIN_ROLES },
  { path: "/dashboard/firm/procedures-expert", match: "prefix", label: "المرشد القضائي", allowedRoles: FIRM_LEGAL_ROLES },
  { path: "/dashboard/firm/circuits-emails", match: "prefix", label: "الدوائر والإيميلات", allowedRoles: [...FIRM_LEGAL_ROLES, "legal_secretary"] },
  { path: "/dashboard/firm/of-counsel", match: "prefix", label: "مستشارون خارجيون", allowedRoles: ["managing_partner", "partner"] },
  { path: "/dashboard/firm/secondment", match: "prefix", label: "إعارة محام", allowedRoles: ["managing_partner", "partner"] },
  { path: "/dashboard/firm/shared-rooms", match: "prefix", label: "الغرف المشتركة", allowedRoles: [...FIRM_LEGAL_ROLES, "legal_secretary"] },
  { path: "/dashboard/firm/marketplace", match: "prefix", label: "سوق المكتب", allowedRoles: ["managing_partner", "partner", "senior_lawyer"] },
  { path: "/dashboard/firm/profile", match: "prefix", label: "ملف المكتب", allowedRoles: ["managing_partner", "partner", "office_admin"] },
  { path: "/dashboard/firm/referrals", match: "prefix", label: "الإحالات", allowedRoles: ["managing_partner", "partner", "office_admin"] },
  { path: "/dashboard/firm/reviews", match: "prefix", label: "التقييمات", allowedRoles: ["managing_partner", "partner", "office_admin"] },
];

function normalizePath(pathname: string): string {
  const pathOnly = pathname.split("?")[0] || "/";
  return pathOnly.length > 1 ? pathOnly.replace(/\/+$/, "") : pathOnly;
}

function matchesRule(pathname: string, rule: Rule<string>): boolean {
  if (rule.match === "exact") return pathname === rule.path;
  return pathname === rule.path || pathname.startsWith(`${rule.path}/`);
}

function getRouteDecision<T extends string>(
  pathname: string,
  role: T,
  rules: readonly Rule<T>[],
): EntityRouteDecision<T> {
  const normalized = normalizePath(pathname);
  const rule = rules.find((candidate) => matchesRule(normalized, candidate));
  if (!rule) return { allowed: true };
  return {
    allowed: rule.allowedRoles.includes(role),
    label: rule.label,
    allowedRoles: rule.allowedRoles,
  };
}

export function getBusinessRouteDecision(pathname: string, role?: BusinessRole | null): EntityRouteDecision<BusinessRole> {
  return getRouteDecision(pathname, role ?? "employee", BUSINESS_ROUTE_RULES);
}

export function getFirmRouteDecision(pathname: string, role?: AffiliationRole | null): EntityRouteDecision<AffiliationRole> {
  return getRouteDecision(pathname, role ?? "managing_partner", FIRM_ROUTE_RULES);
}
