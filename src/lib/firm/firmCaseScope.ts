/**
 * firmCaseScope.ts — Q112 + file 05 #28 (batch l12, migration 20261202_80):
 * which firm roles see only the cases and client cards ASSIGNED to them.
 *
 * Owner default (F01 #112, his assistant's default — so an admin setting, not
 * a constant): «يُقصر الإداري والموارد البشرية والامتثال على ما يُسند إليهم،
 * والمالي يرى المالية دون تفاصيل القضايا».
 *
 *   platform_settings.firm_case_scope =
 *     {"assigned_only_roles": [...], "finance_manager_no_cases": boolean}
 *
 *   - trainee and legal_secretary are ALWAYS narrowed (owner file 15 row 2);
 *     the setting adds any of office_admin / hr_manager / compliance_manager
 *     (default: all three; [] = none). Legal roles are never narrowed here.
 *   - finance_manager_no_cases (default true): the finance manager reads no
 *     case file unless it is assigned to him, but keeps every finance screen
 *     (fees, time, expenses, trust ledger, client cards).
 *
 * The database enforces it (public.firm_case_scope_roles(),
 * firm_case_scoped_member(), firm_case_finance_member() and the policy
 * «firm case: finance manager sees no case files»); parseFirmCaseScope below
 * reads a stored value exactly as the SQL does — a missing or malformed value
 * is the default. firmCaseScope.test.ts holds the two equal.
 *
 * Pure: no imports, so `node --test` loads it.
 */

export const FIRM_CASE_SCOPE_KEY = "firm_case_scope";

/** Narrowed whatever the setting says (owner file 15 row 2, 20261129_10). */
export const FIRM_CASE_ALWAYS_SCOPED_ROLES: readonly string[] = ["trainee", "legal_secretary"];

/** The office roles the admin setting may narrow (Q112). */
export const FIRM_CASE_OPTIONAL_SCOPED_ROLES: readonly string[] = ["office_admin", "hr_manager", "compliance_manager"];

export interface FirmCaseScope {
  assignedOnlyRoles: string[];
  financeManagerNoCases: boolean;
}

export const DEFAULT_FIRM_CASE_SCOPE: Readonly<FirmCaseScope> = Object.freeze({
  assignedOnlyRoles: [...FIRM_CASE_OPTIONAL_SCOPED_ROLES],
  financeManagerNoCases: true,
});

/** A stored value → the scope, as public.firm_case_scope_roles() / firm_case_finance_member() read it. */
export function parseFirmCaseScope(value: unknown): FirmCaseScope {
  const o = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const list = o?.assigned_only_roles;
  const assignedOnlyRoles = Array.isArray(list)
    ? FIRM_CASE_OPTIONAL_SCOPED_ROLES.filter((r) => list.includes(r))
    : [...FIRM_CASE_OPTIONAL_SCOPED_ROLES];
  const fin = o?.finance_manager_no_cases;
  return { assignedOnlyRoles, financeManagerNoCases: typeof fin === "boolean" ? fin : true };
}

/** Every role that sees only its assigned cases under this scope. */
export function firmCaseScopedRoles(scope: FirmCaseScope = DEFAULT_FIRM_CASE_SCOPE): string[] {
  return [...FIRM_CASE_ALWAYS_SCOPED_ROLES, ...scope.assignedOnlyRoles];
}

/** True when the role reads no case file except those assigned to it. */
export function firmRoleSeesAssignedCasesOnly(role: string, scope: FirmCaseScope = DEFAULT_FIRM_CASE_SCOPE): boolean {
  if (firmCaseScopedRoles(scope).includes(role)) return true;
  return role === "finance_manager" && scope.financeManagerNoCases;
}

/** The setting's stored shape for a scope. */
export function firmCaseScopeValue(scope: FirmCaseScope): { assigned_only_roles: string[]; finance_manager_no_cases: boolean } {
  return { assigned_only_roles: [...scope.assignedOnlyRoles], finance_manager_no_cases: scope.financeManagerNoCases };
}

/** Admin write check (PATCH /api/v1/admin/settings); null when acceptable. */
export function firmCaseScopeIssue(value: unknown): string | null {
  const shape =
    `قيمة ${FIRM_CASE_SCOPE_KEY} يجب أن تكون {"assigned_only_roles": [أدوار من: ${FIRM_CASE_OPTIONAL_SCOPED_ROLES.join("، ")}]، ` +
    `"finance_manager_no_cases": true أو false}. المتدرب والسكرتير مقصوران دائماً على ما يُسند إليهما`;
  if (!value || typeof value !== "object" || Array.isArray(value)) return shape;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  if (keys.length !== 2 || keys[0] !== "assigned_only_roles" || keys[1] !== "finance_manager_no_cases") return shape;
  if (typeof o.finance_manager_no_cases !== "boolean") return shape;
  const list = o.assigned_only_roles;
  if (!Array.isArray(list)) return shape;
  if (list.some((r) => typeof r !== "string" || !FIRM_CASE_OPTIONAL_SCOPED_ROLES.includes(r))) return shape;
  if (new Set(list).size !== list.length) return shape;
  return null;
}

/** Arabic names of the roles, for the admin card and the roles screens. */
export const FIRM_SCOPE_ROLE_LABEL_AR: Readonly<Record<string, string>> = Object.freeze({
  trainee: "المتدرب",
  legal_secretary: "السكرتير القانوني",
  office_admin: "مدير المكتب الإداري",
  hr_manager: "مدير الموارد البشرية",
  compliance_manager: "مدير الامتثال",
  finance_manager: "المدير المالي",
});
