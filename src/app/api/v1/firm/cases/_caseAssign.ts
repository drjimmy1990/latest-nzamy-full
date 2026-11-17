/**
 * _caseAssign.ts — who may assign a firm case, and to whom (owner N03-40).
 * Shared by /api/v1/firm/cases/[id]/assign and its test; a route file may
 * export only its handlers.
 */

/** The «توزيع القضايا» rule of FIRM_ROUTE_RULES (src/constants/entityRouteAccess.ts). */
export const FIRM_CASE_ASSIGN_ROLES: ReadonlySet<string> = new Set([
  "managing_partner", "partner", "senior_lawyer",
]);

/** A case goes to a member who practises: the firm's legal roles plus a trainee. */
export const FIRM_CASE_ASSIGNEE_ROLES: ReadonlySet<string> = new Set([
  "managing_partner", "partner", "senior_lawyer", "lawyer", "trainee",
  "legal_consultant", "in_house_counsel", "external_of_counsel",
]);
