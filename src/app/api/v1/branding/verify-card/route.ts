import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { BRANDING_NEEDS_MIGRATION_AR } from "@/lib/branding/brandingVault";
import { ensureOwnVault, resolveBrandingCaller } from "@/lib/branding/brandingServer";
import { isMissingVerifyCardColumn, parseVerifyCardBody } from "@/lib/branding/verifyCard";

/**
 * PUT /api/v1/branding/verify-card — the lawyer's privacy switch for the card
 * his QR opens (q343). Body `{ enabled: boolean }`. Lawyer scope only.
 *
 * Order: resolveBrandingCaller (assertRole, so a frozen account is refused) →
 * the vault read or create THROUGH RLS (the proof this is his own vault) → only
 * then the service role, because sessions hold no UPDATE on this column
 * (20261103_69).
 */

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  const caller = await resolveBrandingCaller("lawyer");
  if (!caller.ok) return caller.response;
  const { supabase, owner } = caller;

  const body = parseVerifyCardBody(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });

  const vault = await ensureOwnVault(supabase, owner);
  if (!vault.ok) {
    return vault.reason === "missing"
      ? NextResponse.json({ error: BRANDING_NEEDS_MIGRATION_AR }, { status: 503 })
      : NextResponse.json({ error: "تعذّر قراءة خزنة الهوية" }, { status: 500 });
  }

  const service = await createServiceClient();
  const { error } = await service.from("branding_vaults").update({ qr_verify_card: body.enabled }).eq("id", vault.row.id);
  if (error) {
    return isMissingVerifyCardColumn(error)
      ? NextResponse.json({ error: BRANDING_NEEDS_MIGRATION_AR }, { status: 503 })
      : NextResponse.json({ error: "تعذّر حفظ الإعداد" }, { status: 500 });
  }
  return NextResponse.json({ enabled: body.enabled }, { headers: { "Cache-Control": "no-store" } });
}
