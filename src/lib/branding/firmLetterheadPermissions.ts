/**
 * firmLetterheadPermissions.ts — who may do what with an office's letterhead,
 * as NAMED permissions (owner answer ٣١٥, package 2026-10-30: «صاحب المكتب
 * والشريك المدير ومدير المكتب فقط» — enforced as «صلاحية صريحة لا دور ضمني»).
 *
 * Before this file the rule was implied: whoever could manage the firm's
 * branding vault could also open the page, so he could also print. Now each
 * action has its own permission, granted explicitly to the roles that hold it,
 * and every gate asks for the permission by name:
 *
 *   letterhead.print  — print / save as PDF the FIRM's letterhead
 *                       (GET /api/v1/branding?scope=firm serves the identity
 *                       only to a holder; the page shows «طباعة» only to one).
 *   branding.manage   — edit the firm's identity, logo and stationery files
 *                       (PUT /api/v1/branding, /logo, /assets).
 *
 * The firm OWNER is firm_profiles.owner_user_id (resolveCallerFirm's isOwner),
 * the other two are firm_members roles that already exist in the database
 * (20260603_phase1_002_entities: role CHECK) — no role is invented here:
 *   managing_partner  «الشريك المدير»
 *   office_admin      «مدير مكتب»
 *
 * The database's own gate, public.can_manage_branding_vault (20261026_63),
 * names the same two roles; firmLetterheadPermissions.test.ts reads that SQL
 * and fails if the lists drift apart.
 *
 * An individual lawyer's own letterhead is his alone: he holds both
 * permissions on scope "lawyer" (brandingServer checks he IS a lawyer).
 *
 * Pure — no React, no Supabase. `node --test` runs it.
 */

export type LetterheadPermission = "letterhead.print" | "branding.manage";

export const LETTERHEAD_PERMISSIONS: readonly LetterheadPermission[] = ["letterhead.print", "branding.manage"];

/** Explicit grants: which firm roles hold each permission, besides the firm owner. */
export const FIRM_LETTERHEAD_GRANTS: Readonly<Record<LetterheadPermission, { owner: boolean; roles: readonly string[] }>> = {
  "letterhead.print": { owner: true, roles: ["managing_partner", "office_admin"] },
  "branding.manage": { owner: true, roles: ["managing_partner", "office_admin"] },
};

export const LETTERHEAD_PERMISSION_LABEL_AR: Record<LetterheadPermission, string> = {
  "letterhead.print": "طباعة ورق المكتب المروّس",
  "branding.manage": "إدارة هوية المكتب ومطبوعاته",
};

/** The refusal each permission's gate answers with (403). */
export const LETTERHEAD_PERMISSION_DENIED_AR: Record<LetterheadPermission, string> = {
  "letterhead.print": "طباعة ورق المكتب المروّس لمالك المكتب والشريك المدير ومدير المكتب فقط",
  "branding.manage": "هوية المكتب يديرها مالك المكتب أو الشريك المدير أو مدير المكتب",
};

export interface FirmCallerRole {
  isOwner: boolean;
  role: string | null | undefined;
}

/** Does this firm caller hold `permission`? Unknown permission or role → false. */
export function firmHas(caller: FirmCallerRole, permission: LetterheadPermission): boolean {
  const grant = FIRM_LETTERHEAD_GRANTS[permission];
  if (!grant) return false;
  if (caller.isOwner && grant.owner) return true;
  return typeof caller.role === "string" && grant.roles.includes(caller.role);
}

export interface LetterheadPermissions {
  print: boolean;
  manage: boolean;
}

/** What the screen may offer — the flags GET /api/v1/branding returns. */
export function letterheadPermissionsFor(scope: "lawyer" | "firm", firm?: FirmCallerRole | null): LetterheadPermissions {
  if (scope === "lawyer") return { print: true, manage: true };
  if (!firm) return { print: false, manage: false };
  return { print: firmHas(firm, "letterhead.print"), manage: firmHas(firm, "branding.manage") };
}
