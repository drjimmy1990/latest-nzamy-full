/**
 * _invitations.ts — the pure half of the firm invitation-link routes (F7,
 * migration 20261125_40). No imports, so `node --test` loads it.
 */

/** Mirrors the role CHECK on firm_members (and the list in create_firm_team_invitation). */
export const FIRM_INVITE_ROLES = [
  "managing_partner", "partner", "senior_lawyer", "lawyer", "trainee",
  "legal_secretary", "office_admin", "finance_manager", "hr_manager",
  "compliance_manager", "external_of_counsel", "legal_consultant", "in_house_counsel",
] as const;

export function isFirmInviteRole(value: unknown): value is (typeof FIRM_INVITE_ROLES)[number] {
  return typeof value === "string" && (FIRM_INVITE_ROLES as readonly string[]).includes(value);
}

/** Lower-cased, trimmed address, or null when it is not one. */
export function normaliseInviteEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  return email;
}

/** The invitee's page; the token is 64 hex characters. */
export function firmInvitePath(token: string): string {
  return `/invite/team/${encodeURIComponent(token)}`;
}

export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{32,128}$/i.test(value);
}

/** Postgres errors of the invitation functions → HTTP status + Arabic. */
export function firmInviteErrorResponse(code: string | null | undefined): { status: number; message: string } {
  if (code === "42883" || code === "PGRST202" || code === "42P01" || code === "PGRST205") {
    return { status: 503, message: "دعوات المكتب بالرابط غير مفعّلة بعد على هذه المنصة." };
  }
  if (code === "42501") return { status: 403, message: "لا تملك صلاحية هذا الإجراء على دعوات المكتب." };
  if (code === "22023") return { status: 400, message: "بيانات الدعوة غير صالحة." };
  if (code === "P0002") return { status: 404, message: "لا توجد دعوة قائمة بهذا الرابط — ربما استُخدمت أو أُلغيت." };
  if (code === "P0003") return { status: 410, message: "انتهت صلاحية هذه الدعوة — اطلب من المكتب دعوة جديدة." };
  return { status: 500, message: "تعذّر إتمام العملية على دعوة المكتب." };
}

/**
 * The redeem RPC's refusals, worded for the invitee (the generic 403 above is
 * worded for the firm's managers).
 */
export function redeemErrorMessage(code: string | null | undefined): { status: number; message: string } {
  if (code === "42501") {
    return {
      status: 403,
      message: "لا يمكن قبول هذه الدعوة بهذا الحساب — سجّل الدخول بالبريد الذي وصلته الدعوة (حساب محامٍ أو حساب فرد)، أو اطلب من المكتب دعوة جديدة.",
    };
  }
  if (code === "22023") return { status: 400, message: "أنت صاحب هذا المكتب، فلا حاجة لقبول الدعوة." };
  return firmInviteErrorResponse(code);
}
