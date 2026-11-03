import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  BRANDING_BUCKET,
  BRANDING_NEEDS_MIGRATION_AR,
  EMPTY_BRANDING_FIELDS,
  isMissingBrandingTable,
  isOwnLogoPath,
  validateBrandingFields,
  type BrandingFields,
} from "@/lib/branding/brandingVault";
import { readOwnVault, resolveBrandingCaller, type VaultRow } from "@/lib/branding/brandingServer";

/**
 * /api/v1/branding?scope=lawyer|firm — the letterhead identity (D4, owner ٢٥٦).
 *
 * GET  the caller's vault (or the profile's name / e-mail / phone as a first
 *      draft when none is saved), the logo as a 10-minute signed URL, the
 *      licence number ONLY when the profile is verified, and — for a lawyer —
 *      what the QR may point at (published or not; the page decides).
 * PUT  saves the text fields through the session (RLS + 63's column grants).
 *
 * Who: src/lib/branding/brandingServer.ts (lawyer himself; firm owner,
 * managing partner, office admin). While 20261026_63 has not run, GET answers
 * `available: false` with «يتطلب تحديث قاعدة البيانات» and PUT 503 — the page
 * still prints a letter from the profile's own name.
 *
 * Service role: only for the caller's OWN rows, after the gate above — the
 * licence column of lawyer_profiles is private to the session since
 * 20261016_10, and the signed URL is issued only for a logo_path read back
 * through RLS and shaped as this vault's own folder.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function fieldsOf(row: VaultRow): BrandingFields {
  return {
    display_name_ar: row.display_name_ar,
    display_name_en: row.display_name_en,
    address: row.address,
    phone: row.phone,
    email: row.email,
    website: row.website,
    accent_color: row.accent_color,
  };
}

export async function GET(request: NextRequest) {
  // Reading the identity is what printing needs: a firm caller must hold the
  // explicit `letterhead.print` permission (owner ٣١٥). Writes ask for
  // `branding.manage` (the default of resolveBrandingCaller).
  const caller = await resolveBrandingCaller(request.nextUrl.searchParams.get("scope"), "letterhead.print");
  if (!caller.ok) return caller.response;
  const { supabase, user, owner } = caller;

  const service = await createServiceClient();

  // The identity the profile already has: a first draft, and the licence.
  let defaults: BrandingFields = { ...EMPTY_BRANDING_FIELDS };
  let licence: { number: string | null; verified: boolean } = { number: null, verified: false };
  let profile: {
    userId: string;
    slug: string | null;
    hasRoleProfile: boolean;
    readFailed: boolean;
    verificationStatus: string | null;
    marketplaceVisible: boolean;
  } | null = null;
  // The firm the QR would open once public firm pages exist (owner ٣١٤).
  const firm: { id: string } | null = owner.scope === "firm" ? { id: owner.ownerId } : null;

  if (owner.scope === "lawyer") {
    const [{ data: p }, lp] = await Promise.all([
      service.from("profiles").select("display_name, email, phone").eq("id", user.id).maybeSingle(),
      service.from("lawyer_profiles")
        .select("license_number, verification_status, slug, marketplace_visible")
        .eq("user_id", user.id).maybeSingle(),
    ]);
    defaults = {
      ...defaults,
      display_name_ar: (p?.display_name as string | null) ?? "",
      email: (p?.email as string | null) ?? "",
      phone: (p?.phone as string | null) ?? "",
    };
    const verified = lp.data?.verification_status === "verified";
    licence = { number: verified ? ((lp.data?.license_number as string | null) || null) : null, verified };
    profile = {
      userId: user.id,
      slug: (lp.data?.slug as string | null) ?? null,
      hasRoleProfile: !!lp.data,
      readFailed: !!lp.error,
      verificationStatus: (lp.data?.verification_status as string | null) ?? null,
      marketplaceVisible: lp.data?.marketplace_visible === true,
    };
  } else {
    const { data: f } = await service
      .from("firm_profiles")
      .select("name_ar, name_en, license_number, verification_status")
      .eq("id", owner.ownerId)
      .maybeSingle();
    defaults = { ...defaults, display_name_ar: (f?.name_ar as string | null) ?? "", display_name_en: (f?.name_en as string | null) ?? "" };
    const verified = f?.verification_status === "verified";
    licence = { number: verified ? ((f?.license_number as string | null) || null) : null, verified };
  }

  const { row, error } = await readOwnVault(supabase, owner);
  if (error && isMissingBrandingTable(error)) {
    return NextResponse.json(
      { available: false, message: BRANDING_NEEDS_MIGRATION_AR, scope: owner.scope, role: owner.firmRole ?? null,
        permissions: owner.permissions, firm,
        saved: false, fields: defaults, defaults, logoUrl: null, licence, profile },
      { headers: NO_STORE },
    );
  }
  if (error) {
    return NextResponse.json({ error: "تعذّر قراءة خزنة الهوية" }, { status: 500, headers: NO_STORE });
  }

  let logoUrl: string | null = null;
  if (row?.logo_path && isOwnLogoPath(row.logo_path, owner.scope, owner.ownerId)) {
    const signed = await service.storage.from(BRANDING_BUCKET).createSignedUrl(row.logo_path, 600);
    logoUrl = signed.data?.signedUrl ?? null;
  }

  return NextResponse.json(
    {
      available: true,
      scope: owner.scope,
      role: owner.firmRole ?? null,
      permissions: owner.permissions,
      firm,
      saved: !!row,
      fields: row ? fieldsOf(row) : defaults,
      defaults,
      hasLogo: !!row?.logo_path,
      logoUrl,
      licence,
      profile,
    },
    { headers: NO_STORE },
  );
}

export async function PUT(request: NextRequest) {
  const caller = await resolveBrandingCaller(request.nextUrl.searchParams.get("scope"));
  if (!caller.ok) return caller.response;
  const { supabase, owner } = caller;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const v = validateBrandingFields(body);
  if (!v.ok) return NextResponse.json({ error: v.error, field: v.field }, { status: 400 });

  const { row, error } = await readOwnVault(supabase, owner);
  if (error && isMissingBrandingTable(error)) {
    return NextResponse.json({ error: BRANDING_NEEDS_MIGRATION_AR, available: false }, { status: 503 });
  }
  if (error) return NextResponse.json({ error: "تعذّر قراءة خزنة الهوية" }, { status: 500 });

  // Session writes only — RLS decides, 63's column grants keep logo_path and
  // the owner columns out of reach.
  const write = row
    ? await supabase.from("branding_vaults").update(v.fields).eq("id", row.id).select("id").maybeSingle()
    : await supabase.from("branding_vaults")
        .insert({ ...(owner.scope === "lawyer" ? { lawyer_user_id: owner.ownerId } : { firm_id: owner.ownerId }), ...v.fields })
        .select("id").maybeSingle();
  if (write.error || !write.data) {
    return NextResponse.json({ error: "تعذّر حفظ بيانات الهوية" }, { status: write.error?.code === "42501" ? 403 : 500 });
  }
  return NextResponse.json({ ok: true, fields: v.fields }, { headers: NO_STORE });
}
