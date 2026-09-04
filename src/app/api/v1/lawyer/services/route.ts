import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { offPlatformContactIssue } from "@/lib/services/contactSanitizer";
import { isPricingKind, isServiceCategory } from "@/lib/services/lawyerProfileFields";
import type { LawyerService, PricingKind, ServiceCategory } from "@/lib/services/lawyerServicesService";

/**
 * /api/v1/lawyer/services — Phase 7 (item 178), the lawyer priced service list.
 *
 * Backed by `public.lawyer_services` (migration
 * 20260907_phase7_profile_services_reviews.sql). GET/POST here; PATCH/DELETE
 * on a single row live in ./[id]/route.ts.
 *
 * `lawyer_services` carries THREE permissive SELECT policies (public read of
 * a verified/listed lawyer's active rows, owner read, owner write FOR ALL) —
 * Postgres ORs them, so an unfiltered select on this "my own list" endpoint
 * would also return every other verified lawyer's active services. Every
 * query here is therefore explicitly scoped with `.eq("lawyer_user_id", user.id)`
 * even though RLS would additionally protect writes on its own.
 */

const SERVICE_SELECT =
  "id, lawyer_user_id, title_ar, description_ar, pricing_kind, price_sar, duration_label, category, active, position, created_at, updated_at";

interface LawyerServiceRow {
  id: string;
  lawyer_user_id: string;
  title_ar: string;
  description_ar: string;
  pricing_kind: string;
  price_sar: number | string | null;
  duration_label: string | null;
  category: string;
  active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

/** price_sar is numeric(12,2) — PostgREST hands it back as a string. */
function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toServiceDto(row: LawyerServiceRow): LawyerService {
  return {
    id: row.id,
    lawyerUserId: row.lawyer_user_id,
    titleAr: row.title_ar,
    descriptionAr: row.description_ar ?? "",
    pricingKind: row.pricing_kind as PricingKind,
    priceSar: num(row.price_sar),
    durationLabel: row.duration_label,
    category: row.category as ServiceCategory,
    active: !!row.active,
    position: row.position ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Postgres error → HTTP status + Arabic message. Local copy of the contracts/_shared.ts helper. */
function dbErrorResponse(error: { code?: string; message?: string } | null | undefined, subject = "الخدمة") {
  const code = error?.code;
  if (code === "23505") return { status: 409, message: `${subject} مسجَّلة مسبقاً.` };
  if (code === "23514") return { status: 400, message: `بيانات ${subject} غير صالحة.` };
  if (code === "23503") return { status: 400, message: `${subject} تشير إلى سجلّ غير موجود.` };
  if (code === "42501") return { status: 403, message: "غير مصرح لك بهذا الإجراء." };
  return { status: 500, message: `تعذّر حفظ ${subject}.` };
}

/**
 * GET /api/v1/lawyer/services — the caller's own services, ALL of them
 * (active and inactive alike — this is the management list, not the public
 * profile feed), ordered by position. Response: { data: LawyerService[], total }.
 */
export async function GET(_request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { data, error, count } = await supabase
      .from("lawyer_services")
      .select(SERVICE_SELECT, { count: "exact" })
      .eq("lawyer_user_id", user.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[lawyer/services GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل الخدمات." }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as LawyerServiceRow[];
    return NextResponse.json({ data: rows.map(toServiceDto), total: count ?? rows.length });
  } catch (err) {
    console.error("[lawyer/services GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

interface CreateBody {
  titleAr?: string;
  descriptionAr?: string;
  pricingKind?: string;
  priceSar?: number | null;
  durationLabel?: string | null;
  category?: string;
  active?: boolean;
  position?: number;
}

/**
 * POST /api/v1/lawyer/services — Response: 201 { data: LawyerService }.
 *
 * Every free-text field this endpoint lets a lawyer publish — title,
 * description, duration label — is checked with offPlatformContactIssue()
 * (item 179): the task spec calls out descriptionAr by name, but the house
 * rule's own governing clause is "every free-text field a lawyer ... publishes",
 * and a 120-char public service TITLE ("استشارة سريعة 0501234567") is exactly
 * the leak 179 exists to stop, same as a duration label. Widened deliberately,
 * not missed.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = (await request.json()) as CreateBody;

    const titleAr = typeof body.titleAr === "string" ? body.titleAr.trim() : "";
    if (titleAr.length < 2 || titleAr.length > 120) {
      return NextResponse.json({ error: "عنوان الخدمة يجب أن يكون بين حرفين و١٢٠ حرفاً." }, { status: 400 });
    }
    const titleIssue = offPlatformContactIssue(titleAr);
    if (titleIssue) return NextResponse.json({ error: titleIssue }, { status: 400 });

    const descriptionAr = typeof body.descriptionAr === "string" ? body.descriptionAr.trim() : "";
    const descriptionIssue = offPlatformContactIssue(descriptionAr);
    if (descriptionIssue) return NextResponse.json({ error: descriptionIssue }, { status: 400 });

    if (!isPricingKind(body.pricingKind)) {
      return NextResponse.json({ error: "نوع التسعير غير صالح." }, { status: 400 });
    }
    const pricingKind = body.pricingKind;

    let priceSar: number | null;
    if (pricingKind === "quote") {
      // "quote" means price_sar is legitimately absent (migration's
      // lawyer_services_price_pair_check) — but if the caller DID send one,
      // it must still be valid, the same way PATCH .../[id] validates it
      // whenever present regardless of pricingKind. Silently coercing a
      // malformed value to null here would accept on create what PATCH
      // rejects on edit for the identical payload.
      if (body.priceSar !== undefined && body.priceSar !== null) {
        if (typeof body.priceSar !== "number" || !Number.isFinite(body.priceSar) || body.priceSar < 0) {
          return NextResponse.json({ error: "السعر يجب أن يكون صفراً أو أكثر." }, { status: 400 });
        }
        priceSar = body.priceSar;
      } else {
        priceSar = null;
      }
    } else {
      if (typeof body.priceSar !== "number" || !Number.isFinite(body.priceSar) || body.priceSar < 0) {
        return NextResponse.json({ error: "السعر مطلوب ويجب أن يكون صفراً أو أكثر." }, { status: 400 });
      }
      priceSar = body.priceSar;
    }

    if (!isServiceCategory(body.category)) {
      return NextResponse.json({ error: "فئة الخدمة غير صالحة." }, { status: 400 });
    }
    const category = body.category;

    let durationLabel: string | null = null;
    if (body.durationLabel !== undefined && body.durationLabel !== null) {
      const trimmed = typeof body.durationLabel === "string" ? body.durationLabel.trim() : "";
      if (trimmed.length > 40) {
        return NextResponse.json({ error: "مدة الخدمة يجب ألا تتجاوز ٤٠ حرفاً." }, { status: 400 });
      }
      const durationIssue = trimmed ? offPlatformContactIssue(trimmed) : null;
      if (durationIssue) return NextResponse.json({ error: durationIssue }, { status: 400 });
      durationLabel = trimmed || null;
    }

    const active = body.active === undefined ? true : !!body.active;

    let position: number;
    if (body.position !== undefined) {
      if (!Number.isInteger(body.position) || body.position < 0) {
        return NextResponse.json({ error: "الترتيب يجب أن يكون رقماً صحيحاً." }, { status: 400 });
      }
      position = body.position;
    } else {
      const { count, error: countError } = await supabase
        .from("lawyer_services")
        .select("id", { count: "exact", head: true })
        .eq("lawyer_user_id", user.id);
      if (countError) {
        console.error("[lawyer/services POST] count failed:", countError.message, countError.code);
      }
      position = count ?? 0;
    }

    const { data, error } = await supabase
      .from("lawyer_services")
      .insert({
        lawyer_user_id: user.id,
        title_ar: titleAr,
        description_ar: descriptionAr,
        pricing_kind: pricingKind,
        price_sar: priceSar,
        duration_label: durationLabel,
        category,
        active,
        position,
      })
      .select(SERVICE_SELECT)
      .single();

    if (error || !data) {
      console.error("[lawyer/services POST] insert failed:", error?.message, error?.code);
      const { status: httpStatus, message } = dbErrorResponse(error);
      return NextResponse.json({ error: message }, { status: httpStatus });
    }

    return NextResponse.json({ data: toServiceDto(data as unknown as LawyerServiceRow) }, { status: 201 });
  } catch (err) {
    console.error("[lawyer/services POST] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
