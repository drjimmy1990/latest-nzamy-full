import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { VerificationStatus } from "@/types/database";
import { isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";
import { toPracticeKind } from "@/lib/auth/practiceKind";

/**
 * GET /api/v1/admin/verifications — List verification requests
 * Query params:
 *   - status ('pending' | 'verified' | 'rejected' | 'suspended' | 'all', default: 'all')
 *   - search (search by name or ID)
 *   - type ('lawyer' | 'firm' | 'notary' | 'arbitrator' | 'bailiff')
 *   - limit (default: 50)
 *   - offset (default: 0)
 *
 * Requires: authenticated admin user
 *
 * Each lawyer row also carries (owner answer ٢١٩):
 *   - licenceImageUrl — a 10-minute signed link to the licence image the lawyer
 *     uploaded (POST /api/v1/lawyer/licence-image), or null when there is none
 *     or signing failed;
 *   - practiceKind — 'advocate' | 'consultant'.
 * Firm and provider rows carry licenceImageUrl: null.
 */
export async function GET(request: NextRequest) {
  // ── Auth check: ensure the caller is an admin ──────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) {
    return NextResponse.json({ error: "غير مصرح — يرجى تسجيل الدخول" }, { status: 401 });
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("id", user.id)
    .single();

  if (!profile || profile.user_type !== "admin") {
    return NextResponse.json({ error: "غير مصرح — صلاحيات المسؤول مطلوبة" }, { status: 403 });
  }

  // ── Parse query params ─────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "all";
  const search = searchParams.get("search");
  const type = searchParams.get("type");
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  // Use service client to bypass RLS for admin operations
  const adminClient = await createServiceClient();

  // ── Fetch lawyer verifications ─────────────────────────────────────────────
  let lawyerQuery = adminClient
    .from("lawyer_profiles")
    .select("*, profiles!inner(id, display_name, display_name_en, email, phone, user_type, created_at)", { count: "exact" })
    .range(offset, offset + limit - 1)
    .order("created_at", { ascending: false });

  if (status !== "all") {
    lawyerQuery = lawyerQuery.eq("verification_status", status as VerificationStatus);
  }

  const { data: lawyerData, error: lawyerError } = await lawyerQuery;

  if (lawyerError) {
    return NextResponse.json({ error: lawyerError.message }, { status: 500 });
  }

  // ── Licence images (owner answer ٢١٩) ────────────────────────────────────
  // licence_image_path and practice_kind (20261019_20) come off the `*` above
  // — service role only for the path. They are deliberately NOT named in the
  // select: before that migration runs, naming them fails this whole queue
  // with 42703, while `*` simply leaves them out (→ null / 'advocate').
  const lawyerRows = (lawyerData ?? []) as Record<string, unknown>[];
  const licenceImageUrls = await Promise.all(
    lawyerRows.map((lp) => signLicenceImage(adminClient, lp.licence_image_path)),
  );

  // ── Fetch provider verifications ───────────────────────────────────────────
  let providerQuery = adminClient
    .from("provider_profiles")
    .select("*, profiles!inner(id, display_name, display_name_en, email, phone, user_type, created_at)", { count: "exact" })
    .range(offset, offset + limit - 1)
    .order("created_at", { ascending: false });

  if (status !== "all") {
    providerQuery = providerQuery.eq("verification_status", status as VerificationStatus);
  }

  const { data: providerData, error: providerError } = await providerQuery;

  if (providerError) {
    return NextResponse.json({ error: providerError.message }, { status: 500 });
  }

  // ── Fetch firm verifications ───────────────────────────────────────────────
  let firmQuery = adminClient
    .from("firm_profiles")
    .select("*, profiles:owner_user_id(id, display_name, display_name_en, email, phone, user_type, created_at)", { count: "exact" })
    .range(offset, offset + limit - 1)
    .order("created_at", { ascending: false });

  if (status !== "all") {
    firmQuery = firmQuery.eq("verification_status", status as VerificationStatus);
  }

  const { data: firmData, error: firmError } = await firmQuery;

  if (firmError) {
    return NextResponse.json({ error: firmError.message }, { status: 500 });
  }

  // ── Transform & merge results ──────────────────────────────────────────────
  type ProfileJoin = {
    id: string;
    display_name: string;
    display_name_en: string;
    email: string | null;
    phone: string | null;
    user_type: string;
    created_at: string;
  };

  const verifications = [
    // Lawyer profiles
    ...lawyerRows.map((lp, i) => {
      const p = lp.profiles as unknown as ProfileJoin;
      return {
        id: `PV-L-${(p.id as string).slice(0, 6)}`,
        user_id: p.id,
        name: p.display_name || p.display_name_en,
        type: "lawyer" as const,
        date: formatRelativeDate(lp.created_at as string),
        docs: buildLawyerDocs(lp),
        aiScore: computeAiScore(lp),
        status: lp.verification_status as string,
        license_number: lp.license_number as string | null,
        email: p.email,
        phone: p.phone,
        licenceImageUrl: licenceImageUrls[i],
        practiceKind: toPracticeKind(lp.practice_kind),
      };
    }),
    // Provider profiles (notary, arbitrator, bailiff)
    ...(providerData ?? []).map((pp: Record<string, unknown>) => {
      const p = pp.profiles as unknown as ProfileJoin;
      return {
        id: `PV-P-${(p.id as string).slice(0, 6)}`,
        user_id: p.id,
        name: p.display_name || p.display_name_en,
        type: (pp.sub_role as string) as "notary" | "arbitrator" | "bailiff",
        date: formatRelativeDate(pp.created_at as string),
        docs: buildProviderDocs(pp),
        aiScore: computeAiScore(pp),
        status: pp.verification_status as string,
        license_number: pp.license_number as string | null,
        email: p.email,
        phone: p.phone,
        licenceImageUrl: null,
      };
    }),
    // Firm profiles
    ...(firmData ?? []).map((fp: Record<string, unknown>) => {
      const p = fp.profiles as unknown as ProfileJoin;
      return {
        id: `PV-F-${(fp.id as string).slice(0, 6)}`,
        user_id: fp.owner_user_id as string,
        name: (fp.name_ar as string) || (fp.name_en as string),
        type: "firm" as const,
        date: formatRelativeDate(fp.created_at as string),
        docs: buildFirmDocs(fp),
        aiScore: computeAiScore(fp),
        status: fp.verification_status as string,
        license_number: fp.license_number as string | null,
        email: p?.email ?? null,
        phone: p?.phone ?? null,
        licenceImageUrl: null,
      };
    }),
  ];

  // ── Apply search filter ────────────────────────────────────────────────────
  let result = verifications;
  if (search) {
    result = result.filter(
      (v) => v.name.includes(search) || v.id.includes(search),
    );
  }
  if (type) {
    result = result.filter((v) => v.type === type);
  }

  // Sort by date (newest first — already sorted per-table, now merge-sort)
  result.sort((a, b) => b.id.localeCompare(a.id));

  return NextResponse.json({ verifications: result, total: result.length });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * A 10-minute signed link to a lawyer's licence image in the private
 * `documents` bucket, or null — no path, an object that is gone, or any
 * signing error. Never throws: one bad row must not 500 the whole queue.
 */
async function signLicenceImage(
  adminClient: Awaited<ReturnType<typeof createServiceClient>>,
  path: unknown,
): Promise<string | null> {
  if (typeof path !== "string" || path === "") return null;
  try {
    const { data, error } = await adminClient.storage
      .from("documents")
      .createSignedUrl(path, 600);
    if (error || !data?.signedUrl) {
      console.error("[admin/verifications GET] licence image signing failed:", error?.message);
      return null;
    }
    return data.signedUrl;
  } catch (err) {
    console.error("[admin/verifications GET] licence image signing threw:", err instanceof Error ? err.message : err);
    return null;
  }
}

function formatRelativeDate(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return "منذ أقل من ساعة";
  if (diffHours === 1) return "منذ ساعة";
  if (diffHours === 2) return "منذ ساعتين";
  if (diffHours < 24) return `منذ ${diffHours} ساعات`;
  if (diffDays === 1) return "منذ يوم";
  if (diffDays === 2) return "منذ يومين";
  if (diffDays < 7) return `منذ ${diffDays} أيام`;
  if (diffDays < 14) return "منذ أسبوع";
  return `منذ ${Math.floor(diffDays / 7)} أسابيع`;
}

function buildLawyerDocs(lp: Record<string, unknown>): string[] {
  const docs: string[] = [];
  if (lp.license_number) docs.push("رخصة محاماة");
  docs.push("بطاقة هوية"); // Always required
  if (lp.bio_ar || lp.bio_en) docs.push("سيرة ذاتية");
  if (lp.specialties && Array.isArray(lp.specialties) && (lp.specialties as string[]).length > 0) {
    docs.push("شهادة تخصص");
  }
  if ((lp.years_experience as number) > 0) docs.push("خبرة عملية");
  return docs.length > 0 ? docs : ["بطاقة هوية"];
}

function buildProviderDocs(pp: Record<string, unknown>): string[] {
  const docs: string[] = [];
  if (pp.license_number) docs.push("تصريح وزاري");
  docs.push("بطاقة هوية");
  return docs;
}

function buildFirmDocs(fp: Record<string, unknown>): string[] {
  const docs: string[] = [];
  if (fp.license_number) docs.push("سجل تجاري");
  docs.push("ترخيص شركة مهنية");
  if (fp.branches && Array.isArray(fp.branches) && (fp.branches as unknown[]).length > 0) {
    docs.push("بيانات الفروع");
  }
  docs.push("بيانات الشركاء");
  return docs;
}

/**
 * Simple heuristic AI score based on profile completeness.
 * In production this would call a real ML model.
 */
function computeAiScore(record: Record<string, unknown>): number {
  let score = 50; // Base score
  if (record.license_number) score += 20;
  if (record.license_expiry) score += 10;

  // Lawyer-specific
  if (record.bio_ar || record.bio_en) score += 5;
  if (record.specialties && Array.isArray(record.specialties) && (record.specialties as string[]).length > 0) score += 5;
  if ((record.years_experience as number) > 3) score += 5;

  // Provider-specific
  if (record.service_areas && Array.isArray(record.service_areas) && (record.service_areas as string[]).length > 0) score += 5;

  // Firm-specific
  if (record.name_ar) score += 5;

  return Math.min(score, 100);
}
