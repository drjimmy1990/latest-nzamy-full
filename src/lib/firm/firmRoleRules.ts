/**
 * firmRoleRules.ts — N03-35/36 (batch l11): what each firm role can do TODAY,
 * read from the constants the platform actually enforces. The «الأدوار
 * والصلاحيات» and «صلاحيات الأقسام» screens render this, read-only; they used
 * to show an editable matrix whose «حفظ» saved nothing and restricted nothing.
 *
 * Every line below points at the rule that enforces it:
 *   sections            FIRM_ROUTE_RULES (src/constants/entityRouteAccess.ts) —
 *                       the dashboard pages a role may open (proxy + layout);
 *   assigned only       FIRM_CASE_SCOPED_ROLES (ownRequestsFilter.ts) + the admin
 *                       setting firm_case_scope (firmCaseScope.ts, Q112), held
 *                       equal to public.firm_case_scoped_member (20261202_80, RLS);
 *   assign / be assigned FIRM_CASE_ASSIGN_ROLES / FIRM_CASE_ASSIGNEE_ROLES
 *                       (/api/v1/firm/cases/[id]/assign);
 *   colleagues' fees    FEE_VISIBLE_FIRM_ROLES (client cards, clientFeeVisibility.ts);
 *   firm statements     FIRM_FEE_STATEMENT_ROLES (20261201_40 policy);
 *   points per member   canViewMemberPoints (firm_member_points_usage);
 *   team roster         FIRM_TEAM_VIEW_ROLES (/api/v1/firm/members);
 *   invitations         FIRM_INVITE_ROLES — the check written inline in
 *                       /api/v1/firm/invitations (`isOwner || managing_partner`);
 *                       a source test keeps the two equal;
 *   letterhead          FIRM_LETTERHEAD_GRANTS (firmLetterheadPermissions.ts).
 * The firm owner's account holds every one of them (it counts as managing
 * partner everywhere: resolveCallerFirm, firmRoleMap).
 *
 * There is no per-firm permission table: nothing here can be edited, and
 * departments do not narrow a role (no rule reads firm_members.department).
 *
 * Pure (relative imports of pure modules only), so `node --test` loads it.
 */
import { FIRM_ROUTE_RULES } from "../../constants/entityRouteAccess.ts";
import { FIRM_CASE_SCOPED_ROLES } from "../services/ownRequestsFilter.ts";
import {
  DEFAULT_FIRM_CASE_SCOPE,
  firmCaseScopedRoles,
  firmRoleSeesAssignedCasesOnly,
  type FirmCaseScope,
} from "./firmCaseScope.ts";
import { FEE_VISIBLE_FIRM_ROLES } from "../services/clientFeeVisibility.ts";
import { FIRM_CASE_ASSIGN_ROLES, FIRM_CASE_ASSIGNEE_ROLES } from "../../app/api/v1/firm/cases/_caseAssign.ts";
import { FIRM_LETTERHEAD_GRANTS } from "../branding/firmLetterheadPermissions.ts";
import { FIRM_FEE_STATEMENT_ROLES } from "../finance/firmFeeStatements.ts";
import { canViewMemberPoints } from "../services/firmMemberPoints.ts";
import { FIRM_TEAM_VIEW_ROLES } from "../auth/firmMembershipAccess.ts";

/** Every value of the firm_members.role CHECK, in the order the screens list them. */
export const FIRM_ROLE_ORDER = [
  "managing_partner", "partner", "senior_lawyer", "lawyer", "trainee",
  "legal_secretary", "office_admin", "finance_manager", "hr_manager",
  "compliance_manager", "external_of_counsel", "legal_consultant", "in_house_counsel",
] as const;
export type FirmRoleId = (typeof FIRM_ROLE_ORDER)[number];

/** /api/v1/firm/invitations: the firm owner or the managing partner. */
export const FIRM_INVITE_ROLES: readonly string[] = ["managing_partner"];

export interface FirmSection {
  path: string;
  label: string;
}

/** The dashboard sections a role may open (the route rules, in their own order). */
export function firmRoleSections(role: string): FirmSection[] {
  return FIRM_ROUTE_RULES
    .filter((rule) => (rule.allowedRoles as readonly string[]).includes(role))
    .map((rule) => ({ path: rule.path, label: rule.label }));
}

function opensSection(role: string, path: string): boolean {
  const rule = FIRM_ROUTE_RULES.find((r) => r.path === path);
  return !!rule && (rule.allowedRoles as readonly string[]).includes(role);
}

export type FirmRuleKey =
  | "cases"
  | "assign"
  | "assignee"
  | "hearings"
  | "clientFees"
  | "firmStatements"
  | "memberPoints"
  | "team"
  | "invite"
  | "letterhead"
  | "branding";

export interface FirmRule {
  key: FirmRuleKey;
  label: string;
  allowed: boolean;
  /** A qualifier shown beside the answer, e.g. «المسندة إليه فقط». */
  note?: string;
}

export const FIRM_RULE_LABEL: Record<FirmRuleKey, string> = {
  cases: "قضايا المكتب",
  assign: "إسناد القضايا إلى الأعضاء",
  assignee: "تُسند إليه القضايا",
  hearings: "جلسات المكتب",
  clientFees: "أتعاب موكّلي الزملاء",
  firmStatements: "كشوف أتعاب أعضاء المكتب",
  memberPoints: "استهلاك النقاط لكل عضو",
  team: "فريق المكتب",
  invite: "دعوة أعضاء جدد",
  letterhead: "طباعة ورق المكتب المروّس",
  branding: "إدارة هوية المكتب ومطبوعاته",
};

/**
 * The rules for one role, in a stable order. `scope` is the platform's
 * firm_case_scope setting (Q112, firmCaseScope.ts) — the default when the
 * screen could not read it.
 */
export function firmRoleRules(role: string, scope: FirmCaseScope = DEFAULT_FIRM_CASE_SCOPE): FirmRule[] {
  const scoped = FIRM_CASE_SCOPED_ROLES.includes(role) || firmCaseScopedRoles(scope).includes(role);
  const financeNoCases = role === "finance_manager" && firmRoleSeesAssignedCasesOnly(role, scope);
  const seesCases = opensSection(role, "/dashboard/firm/cases");
  const rules: FirmRule[] = [
    {
      key: "cases",
      label: FIRM_RULE_LABEL.cases,
      allowed: scoped || seesCases,
      note: scoped
        ? "المسندة إليه فقط"
        : financeNoCases
          ? "لا يطّلع على ملفات القضايا، ويرى المالية والأتعاب"
          : seesCases ? "كل قضايا المكتب" : undefined,
    },
    { key: "assign", label: FIRM_RULE_LABEL.assign, allowed: FIRM_CASE_ASSIGN_ROLES.has(role) },
    { key: "assignee", label: FIRM_RULE_LABEL.assignee, allowed: FIRM_CASE_ASSIGNEE_ROLES.has(role) },
    { key: "hearings", label: FIRM_RULE_LABEL.hearings, allowed: opensSection(role, "/dashboard/firm/hearings") },
    { key: "clientFees", label: FIRM_RULE_LABEL.clientFees, allowed: FEE_VISIBLE_FIRM_ROLES.includes(role) },
    { key: "firmStatements", label: FIRM_RULE_LABEL.firmStatements, allowed: FIRM_FEE_STATEMENT_ROLES.includes(role) },
    { key: "memberPoints", label: FIRM_RULE_LABEL.memberPoints, allowed: canViewMemberPoints({ isOwner: false, role }) },
    { key: "team", label: FIRM_RULE_LABEL.team, allowed: FIRM_TEAM_VIEW_ROLES.has(role) },
    { key: "invite", label: FIRM_RULE_LABEL.invite, allowed: FIRM_INVITE_ROLES.includes(role) },
    {
      key: "letterhead",
      label: FIRM_RULE_LABEL.letterhead,
      allowed: FIRM_LETTERHEAD_GRANTS["letterhead.print"].roles.includes(role),
    },
    {
      key: "branding",
      label: FIRM_RULE_LABEL.branding,
      allowed: FIRM_LETTERHEAD_GRANTS["branding.manage"].roles.includes(role),
    },
  ];
  return rules;
}

