/**
 * brandingServer.ts — who is asking for which vault (D4, owner ٢٥٦), shared by
 * /api/v1/branding and /api/v1/branding/logo.
 *
 * Two scopes, the two owners 20261026_63 allows:
 *   lawyer — the caller's own vault; the account must be a lawyer account
 *            (an admin passes assertRole but is not a lawyer, so is refused:
 *            the table's RLS would refuse the write anyway).
 *   firm   — the caller's firm (resolveCallerFirm: the firm he owns, else his
 *            first active membership), and only for the owner or a
 *            managing_partner / office_admin — the same rule as
 *            public.can_manage_branding_vault. Anyone else: 403.
 *
 * This is the first gate; RLS on branding_vaults is the second. The routes
 * use the service role only AFTER an RLS read of the vault has succeeded
 * (logo upload, signed URL), never instead of it.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { assertRole } from "@/lib/auth/assertRole";
import { resolveCallerFirm } from "@/lib/auth/firmMembershipAccess";
import { FIRM_BRANDING_ROLES, type BrandingScope } from "./brandingVault";

export interface BrandingOwner {
  scope: BrandingScope;
  /** lawyer: the user id; firm: firm_profiles.id. */
  ownerId: string;
  /** firm only: the caller's role in the firm. */
  firmRole?: string;
}

export type BrandingCaller =
  | { ok: true; supabase: SupabaseClient; user: User; owner: BrandingOwner }
  | { ok: false; response: NextResponse };

export function parseBrandingScope(value: string | null): BrandingScope | null {
  return value === "lawyer" || value === "firm" ? value : null;
}

export async function resolveBrandingCaller(scopeParam: string | null): Promise<BrandingCaller> {
  const scope = parseBrandingScope(scopeParam);
  if (!scope) {
    return { ok: false, response: NextResponse.json({ error: "النطاق غير صالح (lawyer أو firm)" }, { status: 400 }) };
  }
  const auth = await assertRole();
  if (!auth.ok) return auth;
  const { supabase, user, userType } = auth;

  if (scope === "lawyer") {
    if (userType !== "lawyer") {
      return { ok: false, response: NextResponse.json({ error: "الورق المروّس الشخصي متاح للمحامي المرخّص فقط" }, { status: 403 }) };
    }
    return { ok: true, supabase, user, owner: { scope, ownerId: user.id } };
  }

  const { data: firm, error } = await resolveCallerFirm(supabase, user.id);
  if (error) {
    return { ok: false, response: NextResponse.json({ error: "تعذّر التحقق من عضويتك في المكتب" }, { status: 500 }) };
  }
  if (!firm) {
    return { ok: false, response: NextResponse.json({ error: "لا يوجد مكتب مرتبط بحسابك" }, { status: 404 }) };
  }
  if (!firm.isOwner && !FIRM_BRANDING_ROLES.has(firm.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "هوية المكتب يديرها مالك المكتب أو الشريك المدير أو مدير المكتب" }, { status: 403 }),
    };
  }
  return { ok: true, supabase, user, owner: { scope, ownerId: firm.id, firmRole: firm.isOwner ? "owner" : firm.role } };
}

/** The vault row as the session may see it (RLS). */
export const VAULT_COLUMNS =
  "id, lawyer_user_id, firm_id, display_name_ar, display_name_en, address, phone, email, website, accent_color, logo_path, updated_at";

export interface VaultRow {
  id: string;
  lawyer_user_id: string | null;
  firm_id: string | null;
  display_name_ar: string;
  display_name_en: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  accent_color: string;
  logo_path: string | null;
  updated_at: string;
}

/** Reads the caller's vault through RLS. `missing` = 63 has not run. */
export async function readOwnVault(
  supabase: SupabaseClient,
  owner: BrandingOwner,
): Promise<{ row: VaultRow | null; error: { code?: string; message?: string } | null }> {
  const column = owner.scope === "lawyer" ? "lawyer_user_id" : "firm_id";
  const { data, error } = await supabase
    .from("branding_vaults")
    .select(VAULT_COLUMNS)
    .eq(column, owner.ownerId)
    .maybeSingle();
  return { row: (data as VaultRow | null) ?? null, error };
}
