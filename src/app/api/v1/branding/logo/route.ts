import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  BRANDING_BUCKET,
  BRANDING_LOGO_MAX_BYTES,
  BRANDING_NEEDS_MIGRATION_AR,
  brandingLogoPath,
  isMissingBrandingTable,
  isOwnLogoPath,
  sniffLogoImage,
} from "@/lib/branding/brandingVault";
import { readOwnVault, resolveBrandingCaller } from "@/lib/branding/brandingServer";

/**
 * /api/v1/branding/logo?scope=lawyer|firm — the office's own logo (D4, ٢٥٦).
 *
 * POST (multipart, field `file`): PNG, JPEG or WebP up to 1 MB, recognised by
 *      its BYTES (sniffLogoImage) — the name and the browser's Content-Type
 *      are ignored, so an SVG renamed .png is refused. Stored under a fresh
 *      name in the private `branding` bucket, the vault's logo_path pointed at
 *      it, the previous object removed.
 * DELETE removes the logo.
 *
 * Order: resolveBrandingCaller (role gate) → the vault read THROUGH RLS (the
 * proof this caller manages this vault; the row is created first if the
 * office never saved its identity) → only then the service role, which owns
 * logo_path (sessions cannot write it — 20261026_63) and the bucket write.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function vaultForWrite(scopeParam: string | null) {
  const caller = await resolveBrandingCaller(scopeParam);
  if (!caller.ok) return caller;
  const { supabase, owner } = caller;
  let { row, error } = await readOwnVault(supabase, owner);
  if (error && isMissingBrandingTable(error)) {
    return { ok: false as const, response: NextResponse.json({ error: BRANDING_NEEDS_MIGRATION_AR, available: false }, { status: 503 }) };
  }
  if (error) return { ok: false as const, response: NextResponse.json({ error: "تعذّر قراءة خزنة الهوية" }, { status: 500 }) };
  if (!row) {
    const created = await supabase
      .from("branding_vaults")
      .insert(owner.scope === "lawyer" ? { lawyer_user_id: owner.ownerId } : { firm_id: owner.ownerId })
      .select("id")
      .maybeSingle();
    if (created.error || !created.data) {
      return { ok: false as const, response: NextResponse.json({ error: "تعذّر إنشاء خزنة الهوية" }, { status: 500 }) };
    }
    ({ row, error } = await readOwnVault(supabase, owner));
    if (error || !row) {
      return { ok: false as const, response: NextResponse.json({ error: "تعذّر قراءة خزنة الهوية" }, { status: 500 }) };
    }
  }
  return { ok: true as const, owner, row };
}

export async function POST(request: NextRequest) {
  const gate = await vaultForWrite(request.nextUrl.searchParams.get("scope"));
  if (!gate.ok) return gate.response;
  const { owner, row } = gate;

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("file");
    file = value instanceof File ? value : null;
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "لم يُرفق ملف" }, { status: 400 });
  if (file.size > BRANDING_LOGO_MAX_BYTES) {
    return NextResponse.json({ error: "حجم الشعار يتجاوز ١ ميجابايت" }, { status: 413 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > BRANDING_LOGO_MAX_BYTES) {
    return NextResponse.json({ error: "حجم الشعار يتجاوز ١ ميجابايت" }, { status: 413 });
  }
  const kind = sniffLogoImage(bytes);
  if (!kind) {
    return NextResponse.json({ error: "الشعار يجب أن يكون صورة PNG أو JPEG أو WebP (لا يُقبل SVG)" }, { status: 415 });
  }

  const path = brandingLogoPath(owner.scope, owner.ownerId, randomBytes(8).toString("hex"), kind.ext);
  const service = await createServiceClient();
  const up = await service.storage.from(BRANDING_BUCKET).upload(path, bytes, { contentType: kind.mime, upsert: false });
  if (up.error) {
    const missingBucket = /bucket/i.test(up.error.message ?? "") && /not found/i.test(up.error.message ?? "");
    return NextResponse.json(
      { error: missingBucket ? "حاوية الشعارات غير مهيّأة بعد على الخادم (يتطلب تحديث قاعدة البيانات)" : "تعذّر رفع الشعار" },
      { status: missingBucket ? 503 : 500 },
    );
  }
  const set = await service.from("branding_vaults").update({ logo_path: path }).eq("id", row.id);
  if (set.error) {
    await service.storage.from(BRANDING_BUCKET).remove([path]);
    return NextResponse.json({ error: "تعذّر حفظ الشعار" }, { status: 500 });
  }
  if (row.logo_path && row.logo_path !== path && isOwnLogoPath(row.logo_path, owner.scope, owner.ownerId)) {
    await service.storage.from(BRANDING_BUCKET).remove([row.logo_path]);
  }
  const signed = await service.storage.from(BRANDING_BUCKET).createSignedUrl(path, 600);
  return NextResponse.json({ ok: true, logoUrl: signed.data?.signedUrl ?? null }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest) {
  const gate = await vaultForWrite(request.nextUrl.searchParams.get("scope"));
  if (!gate.ok) return gate.response;
  const { owner, row } = gate;
  if (!row.logo_path) return NextResponse.json({ ok: true });
  const service = await createServiceClient();
  const set = await service.from("branding_vaults").update({ logo_path: null }).eq("id", row.id);
  if (set.error) return NextResponse.json({ error: "تعذّر حذف الشعار" }, { status: 500 });
  if (isOwnLogoPath(row.logo_path, owner.scope, owner.ownerId)) {
    await service.storage.from(BRANDING_BUCKET).remove([row.logo_path]);
  }
  return NextResponse.json({ ok: true });
}
