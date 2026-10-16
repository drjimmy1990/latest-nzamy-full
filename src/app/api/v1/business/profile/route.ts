import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { resolveCallerBusinessScope } from "@/lib/auth/businessCallerScope";
import { canWriteBusinessProfile } from "@/lib/auth/businessProfileScope";
import {
  isPlainObject,
  validateEntitySettingsPatch,
  mergeEntitySettings,
  readEntitySettings,
  validateBusinessProfilePatch,
  type EntitySettingsValue,
  type BusinessProfilePatch,
} from "@/lib/services/profileEntityFields";
import { normalizeCrNumber, isLegalRepCapacity } from "@/app/register/client/components/_corporateIdentity";

/**
 * /api/v1/business/profile — the company's data, for whoever belongs to the
 * company: owner decision ٣٦ («تعديل بيانات الشركة محصور في مالك الحساب
 * الرئيسي، أو المفوّض رسمياً … المسجّل في جدول التفويضات»).
 *
 * WHY A SECOND ENDPOINT NEXT TO /api/v1/profile
 *   /api/v1/profile serves the CALLER'S OWN account and decides the company
 *   arm by `profiles.user_type === "corporate"`. A delegate is a company
 *   MEMBER, and members are `individual` / `lawyer` accounts (the members route
 *   invites those); a corporate account always owns its own company row, so on
 *   that endpoint it resolves as the owner of its own company and never as
 *   another company's delegate. Without this route a registered delegate would
 *   have the right and no way to use it.
 *
 *   GET    { businessProfile, entitySettings, businessProfileScope,
 *            roleProfileReadFailed } — the same envelope keys EntitySettingsTab
 *            reads from /api/v1/profile, so the tab renders either source.
 *   PATCH  { businessProfile?, entitySettings? } — owner or registered
 *            delegate only; members get a specific Arabic 403.
 *
 * Every read and write goes through the caller's RLS-scoped client and is keyed
 * by the company id. RLS is the gate: the owner's UPDATE policy, the delegate's
 * UPDATE policy (20261017_30), the column list of 20260922_03 (verification,
 * plan and owner columns are unwritable for both), and the trigger that keeps
 * `metadata.features` (the admin console's flags) out of reach.
 */

const AR = {
  readFailed: "تعذّر قراءة بيانات المنشأة.",
  saveFailed: "تعذّر حفظ بيانات المنشأة. حاول مرة أخرى.",
  noBusiness: "لا توجد منشأة مرتبطة بهذا الحساب.",
  notEditor: "تعديل بيانات الشركة متاح لمالك الحساب أو المفوَّض المسجَّل في سجل التفويضات فقط.",
  badEntitySettingsShape: "بيانات إعدادات الكيان يجب أن تكون كائناً.",
  noFields: "لا توجد حقول لتحديثها.",
} as const;

const IDENTITY_COLUMNS = "company_name_ar, cr_number, legal_rep_name, legal_rep_capacity, service_model, has_legal_dept";

type IdentityRow = Record<string, unknown> & { metadata?: unknown };

function toBusinessProfile(row: IdentityRow) {
  return {
    company_name_ar: row.company_name_ar ?? null,
    cr_number: row.cr_number ?? null,
    legal_rep_name: row.legal_rep_name ?? null,
    legal_rep_capacity: row.legal_rep_capacity ?? null,
    service_model: row.service_model ?? null,
    has_legal_dept: row.has_legal_dept ?? null,
  };
}

export async function GET(_request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const scope = await resolveCallerBusinessScope(supabase, user.id, "business/profile GET");
    if (!scope.businessId) {
      if (scope.readFailed) return NextResponse.json({ error: AR.readFailed }, { status: 500 });
      return NextResponse.json({ error: AR.noBusiness }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("business_profiles")
      .select(`metadata, ${IDENTITY_COLUMNS}`)
      .eq("id", scope.businessId)
      .maybeSingle();
    if (error) {
      console.error("[business/profile GET] read failed:", error.message, error.code);
      return NextResponse.json({
        businessProfile: null,
        entitySettings: null,
        businessProfileScope: scope.scope,
        roleProfileReadFailed: true,
      });
    }

    const row = (data ?? null) as IdentityRow | null;
    return NextResponse.json({
      businessProfile: row ? toBusinessProfile(row) : null,
      entitySettings: row ? readEntitySettings(row.metadata) : null,
      businessProfileScope: scope.scope,
      // A failed delegation lookup leaves the scope at "member" with this flag
      // up: the tab then disables Save and says it could not read, instead of
      // telling a possible delegate that only the owner may edit.
      roleProfileReadFailed: scope.readFailed || !row,
    });
  } catch (err) {
    console.error("[business/profile GET] Unexpected error:", err);
    return NextResponse.json({ error: AR.readFailed }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!isPlainObject(body)) return NextResponse.json({ error: AR.noFields }, { status: 400 });

    let entitySettingsPatch: Record<string, EntitySettingsValue> | null = null;
    if (body.entitySettings !== undefined && body.entitySettings !== null) {
      if (!isPlainObject(body.entitySettings)) {
        return NextResponse.json({ error: AR.badEntitySettingsShape }, { status: 400 });
      }
      if (Object.keys(body.entitySettings).length > 0) {
        const validation = validateEntitySettingsPatch(body.entitySettings);
        if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
        entitySettingsPatch = validation.patch;
      }
    }

    let businessProfilePatch: BusinessProfilePatch | null = null;
    if (body.businessProfile !== undefined && body.businessProfile !== null) {
      const validation = validateBusinessProfilePatch(
        body.businessProfile,
        normalizeCrNumber,
        (v: unknown) => isLegalRepCapacity(v as string | null | undefined),
      );
      if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
      if (Object.keys(validation.patch).length > 0) businessProfilePatch = validation.patch;
    }

    if (entitySettingsPatch === null && businessProfilePatch === null) {
      return NextResponse.json({ error: AR.noFields }, { status: 400 });
    }

    // Decided before either write, so a refused request leaves nothing behind.
    const scope = await resolveCallerBusinessScope(supabase, user.id, "business/profile PATCH");
    if (!scope.businessId) {
      if (scope.readFailed) return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
      return NextResponse.json({ error: AR.noBusiness }, { status: 404 });
    }
    if (!canWriteBusinessProfile(scope.scope)) {
      // A lookup that failed is not proof the caller is a plain member.
      if (scope.readFailed) return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
      return NextResponse.json({ error: AR.notEditor }, { status: 403 });
    }
    const businessId = scope.businessId;

    let entitySettings: Record<string, unknown> | null = null;
    if (entitySettingsPatch !== null) {
      const { data: current, error: readErr } = await supabase
        .from("business_profiles")
        .select("metadata")
        .eq("id", businessId)
        .maybeSingle();
      if (readErr || !current) {
        if (readErr) console.error("[business/profile PATCH] metadata read failed:", readErr.message, readErr.code);
        return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
      }
      const merged = mergeEntitySettings((current as { metadata?: unknown }).metadata, entitySettingsPatch);
      const { data: written, error: writeErr } = await supabase
        .from("business_profiles")
        .update({ metadata: merged })
        .eq("id", businessId)
        .select("metadata")
        .maybeSingle();
      if (writeErr || !written) {
        // Zero rows back means RLS refused the row: the scope said editor, the
        // database disagreed — never report that as saved.
        if (writeErr) console.error("[business/profile PATCH] metadata write failed:", writeErr.message, writeErr.code);
        return NextResponse.json({ error: writeErr ? AR.saveFailed : AR.notEditor }, { status: writeErr ? 500 : 403 });
      }
      entitySettings = readEntitySettings((written as { metadata?: unknown }).metadata);
    }

    let businessProfile: Record<string, unknown> | null = null;
    if (businessProfilePatch !== null) {
      const { data, error } = await supabase
        .from("business_profiles")
        .update(businessProfilePatch)
        .eq("id", businessId)
        .select(IDENTITY_COLUMNS)
        .maybeSingle();
      if (error || !data) {
        if (error) console.error("[business/profile PATCH] identity write failed:", error.message, error.code);
        return NextResponse.json({ error: error ? AR.saveFailed : AR.notEditor }, { status: error ? 500 : 403 });
      }
      businessProfile = toBusinessProfile(data as IdentityRow);
    }

    return NextResponse.json({ businessProfile, entitySettings, businessProfileScope: scope.scope });
  } catch (err) {
    console.error("[business/profile PATCH] Unexpected error:", err);
    return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
  }
}
