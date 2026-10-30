import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { BRANDING_NEEDS_MIGRATION_AR, isMissingBrandingTable } from "@/lib/branding/brandingVault";
import {
  BRANDING_ASSETS_NEEDS_MIGRATION_AR,
  BRANDING_ASSET_SPEC,
  BRANDING_FILES_BUCKET,
  BRANDING_MULTIPART_ALLOWANCE,
  brandingAssetPath,
  isMissingBrandingAssetsTable,
  isOwnAssetPath,
  parseBrandingAssetKind,
  safeAssetFileName,
  sniffBrandingAsset,
  type BrandingAssetKind,
} from "@/lib/branding/brandingAssets";
import { ensureOwnVault, readOwnVault, resolveBrandingCaller, type BrandingOwner } from "@/lib/branding/brandingServer";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * /api/v1/branding/assets?scope=lawyer|firm — the office's own ready-made
 * stationery in the legal vault (owner note 09 §٢-أ, NOTE-09-C01, LIVE-F08):
 * the Word letterhead template, a full-page PDF letterhead, the stamp and the
 * signature. One file per kind; uploading again replaces it.
 *
 * GET    the caller's files, each with a 10-minute signed DOWNLOAD url.
 * POST   multipart: `kind` + `file`. The type is read from the BYTES
 *        (sniffBrandingAsset), never the name or Content-Type; a .docx with
 *        macros is refused.
 * DELETE ?kind=… removes that file.
 *
 * Order, as in the logo route: resolveBrandingCaller (the explicit permission
 * — GET `letterhead.print`, writes `branding.manage`, owner ٣١٥) → the vault
 * read THROUGH RLS (the proof this caller manages it) → the asset rows read
 * through RLS → only then the service role, which alone writes branding_assets
 * and the private `branding-files` bucket (20261030_14).
 *
 * Before 20261030_14 runs: GET answers `available: false` with
 * «يتطلب تحديث قاعدة البيانات», writes 503 — nothing is faked.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const ASSET_COLUMNS = "id, vault_id, kind, path, original_name, mime, size_bytes, created_at";

interface AssetRow {
  id: string;
  vault_id: string;
  kind: string;
  path: string;
  original_name: string;
  mime: string;
  size_bytes: number;
  created_at: string;
}

async function readAssets(supabase: SupabaseClient, vaultId: string) {
  const { data, error } = await supabase.from("branding_assets").select(ASSET_COLUMNS).eq("vault_id", vaultId);
  return { rows: (data as AssetRow[] | null) ?? [], error };
}

async function listFor(owner: BrandingOwner, rows: AssetRow[]) {
  const service = await createServiceClient();
  const out = [];
  for (const r of rows) {
    const kind = parseBrandingAssetKind(r.kind);
    if (!kind || !isOwnAssetPath(r.path, owner.scope, owner.ownerId, kind)) continue;
    const ext = r.path.slice(r.path.lastIndexOf(".") + 1) as Parameters<typeof safeAssetFileName>[1];
    const signed = await service.storage.from(BRANDING_FILES_BUCKET)
      .createSignedUrl(r.path, 600, { download: safeAssetFileName(r.original_name, ext) });
    out.push({
      kind,
      name: r.original_name,
      mime: r.mime,
      size: r.size_bytes,
      uploadedAt: r.created_at,
      downloadUrl: signed.data?.signedUrl ?? null,
    });
  }
  return out;
}

export async function GET(request: NextRequest) {
  const caller = await resolveBrandingCaller(request.nextUrl.searchParams.get("scope"), "letterhead.print");
  if (!caller.ok) return caller.response;
  const { supabase, owner } = caller;

  const vault = await readOwnVault(supabase, owner);
  if (vault.error) {
    return isMissingBrandingTable(vault.error)
      ? NextResponse.json({ available: false, message: BRANDING_NEEDS_MIGRATION_AR, assets: [], permissions: owner.permissions }, { headers: NO_STORE })
      : NextResponse.json({ error: "تعذّر قراءة خزنة الهوية" }, { status: 500, headers: NO_STORE });
  }
  if (!vault.row) {
    // No vault yet: probe the table so a server without 20261030_14 says so.
    const probe = await supabase.from("branding_assets").select("id").limit(1);
    if (probe.error && isMissingBrandingAssetsTable(probe.error)) {
      return NextResponse.json({ available: false, message: BRANDING_ASSETS_NEEDS_MIGRATION_AR, assets: [], permissions: owner.permissions }, { headers: NO_STORE });
    }
    return NextResponse.json({ available: true, assets: [], permissions: owner.permissions }, { headers: NO_STORE });
  }
  const { rows, error } = await readAssets(supabase, vault.row.id);
  if (error && isMissingBrandingAssetsTable(error)) {
    return NextResponse.json({ available: false, message: BRANDING_ASSETS_NEEDS_MIGRATION_AR, assets: [], permissions: owner.permissions }, { headers: NO_STORE });
  }
  if (error) return NextResponse.json({ error: "تعذّر قراءة مطبوعات المكتب" }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ available: true, assets: await listFor(owner, rows), permissions: owner.permissions }, { headers: NO_STORE });
}

function refuse(reason: "missing" | "failed") {
  return reason === "missing"
    ? NextResponse.json({ error: BRANDING_NEEDS_MIGRATION_AR, available: false }, { status: 503 })
    : NextResponse.json({ error: "تعذّر قراءة خزنة الهوية" }, { status: 500 });
}

export async function POST(request: NextRequest) {
  const caller = await resolveBrandingCaller(request.nextUrl.searchParams.get("scope"));
  if (!caller.ok) return caller.response;
  const { supabase, owner } = caller;

  // Refuse an oversized or undeclared body before buffering it.
  const rawLength = (request.headers.get("content-length") ?? "").trim();
  if (!/^\d+$/.test(rawLength)) return NextResponse.json({ error: "حجم الطلب غير معروف" }, { status: 411 });
  if (Number(rawLength) > BRANDING_ASSET_SPEC.letterhead_docx.maxBytes + BRANDING_MULTIPART_ALLOWANCE) {
    return NextResponse.json({ error: "حجم الملف يتجاوز ٥ ميجابايت" }, { status: 413 });
  }

  const vault = await ensureOwnVault(supabase, owner);
  if (!vault.ok) return refuse(vault.reason);
  const existing = await readAssets(supabase, vault.row.id);
  if (existing.error && isMissingBrandingAssetsTable(existing.error)) {
    return NextResponse.json({ error: BRANDING_ASSETS_NEEDS_MIGRATION_AR, available: false }, { status: 503 });
  }
  if (existing.error) return NextResponse.json({ error: "تعذّر قراءة مطبوعات المكتب" }, { status: 500 });

  let kind: BrandingAssetKind | null = null;
  let file: File | null = null;
  try {
    const form = await request.formData();
    kind = parseBrandingAssetKind(form.get("kind"));
    const value = form.get("file");
    file = value instanceof File ? value : null;
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  if (!kind) return NextResponse.json({ error: "نوع الملف غير صالح" }, { status: 400 });
  if (!file) return NextResponse.json({ error: "لم يُرفق ملف" }, { status: 400 });
  const spec = BRANDING_ASSET_SPEC[kind];
  if (file.size <= 0) return NextResponse.json({ error: "الملف فارغ" }, { status: 400 });
  if (file.size > spec.maxBytes) return NextResponse.json({ error: `حجم الملف يتجاوز ${spec.maxLabel}` }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > spec.maxBytes) return NextResponse.json({ error: `حجم الملف يتجاوز ${spec.maxLabel}` }, { status: 413 });
  const sniffed = sniffBrandingAsset(kind, bytes);
  if (!sniffed.ok) return NextResponse.json({ error: sniffed.error }, { status: 415 });

  const path = brandingAssetPath(owner.scope, owner.ownerId, kind, randomBytes(8).toString("hex"), sniffed.ext);
  const name = safeAssetFileName(file.name, sniffed.ext);
  const service = await createServiceClient();
  const up = await service.storage.from(BRANDING_FILES_BUCKET).upload(path, bytes, { contentType: sniffed.mime, upsert: false });
  if (up.error) {
    const missingBucket = /bucket/i.test(up.error.message ?? "") && /not found/i.test(up.error.message ?? "");
    return NextResponse.json(
      { error: missingBucket ? "حاوية مطبوعات المكتب غير مهيّأة بعد على الخادم (يتطلب تحديث قاعدة البيانات)" : "تعذّر رفع الملف" },
      { status: missingBucket ? 503 : 500 },
    );
  }
  const previous = existing.rows.find((r) => r.kind === kind) ?? null;
  const write = await service.from("branding_assets").upsert(
    { vault_id: vault.row.id, kind, path, original_name: name, mime: sniffed.mime, size_bytes: bytes.byteLength },
    { onConflict: "vault_id,kind" },
  );
  if (write.error) {
    await service.storage.from(BRANDING_FILES_BUCKET).remove([path]);
    return NextResponse.json({ error: "تعذّر حفظ الملف" }, { status: 500 });
  }
  if (previous && previous.path !== path && isOwnAssetPath(previous.path, owner.scope, owner.ownerId, kind)) {
    await service.storage.from(BRANDING_FILES_BUCKET).remove([previous.path]);
  }
  const after = await readAssets(supabase, vault.row.id);
  return NextResponse.json({ ok: true, assets: await listFor(owner, after.rows) }, { headers: NO_STORE });
}

export async function DELETE(request: NextRequest) {
  const caller = await resolveBrandingCaller(request.nextUrl.searchParams.get("scope"));
  if (!caller.ok) return caller.response;
  const { supabase, owner } = caller;
  const kind = parseBrandingAssetKind(request.nextUrl.searchParams.get("kind"));
  if (!kind) return NextResponse.json({ error: "نوع الملف غير صالح" }, { status: 400 });

  const vault = await readOwnVault(supabase, owner);
  if (vault.error) return refuse(isMissingBrandingTable(vault.error) ? "missing" : "failed");
  if (!vault.row) return NextResponse.json({ ok: true, assets: [] });
  const existing = await readAssets(supabase, vault.row.id);
  if (existing.error && isMissingBrandingAssetsTable(existing.error)) {
    return NextResponse.json({ error: BRANDING_ASSETS_NEEDS_MIGRATION_AR, available: false }, { status: 503 });
  }
  if (existing.error) return NextResponse.json({ error: "تعذّر قراءة مطبوعات المكتب" }, { status: 500 });
  const row = existing.rows.find((r) => r.kind === kind);
  if (row) {
    const service = await createServiceClient();
    const del = await service.from("branding_assets").delete().eq("id", row.id).eq("vault_id", vault.row.id);
    if (del.error) return NextResponse.json({ error: "تعذّر حذف الملف" }, { status: 500 });
    if (isOwnAssetPath(row.path, owner.scope, owner.ownerId, kind)) {
      await service.storage.from(BRANDING_FILES_BUCKET).remove([row.path]);
    }
  }
  const after = await readAssets(supabase, vault.row.id);
  return NextResponse.json({ ok: true, assets: await listFor(owner, after.rows) }, { headers: NO_STORE });
}
