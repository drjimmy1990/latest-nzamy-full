import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { offPlatformContactIssue } from "@/lib/services/contactSanitizer";
import { isPricingKind, isServiceCategory } from "@/lib/services/lawyerProfileFields";
import type { LawyerService, PricingKind, ServiceCategory } from "@/lib/services/lawyerServicesService";

/**
 * /api/v1/lawyer/services/[id] — Phase 7 (item 178). See ../route.ts.
 *
 * Same explicit `.eq("lawyer_user_id", user.id)` scoping as the list route on
 * every query here (read-before-patch, the update, and the delete): the table
 * also carries a public-read RLS policy for other verified lawyers' active
 * services, so a bare `.eq("id", id)` would resolve a foreign row too.
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

interface UpdateBody {
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
 * PATCH /api/v1/lawyer/services/[id] — same validation as POST, applied only
 * to the fields present in the body. 0 rows → 404. Response: { data: LawyerService }.
 *
 * The price/pricing-kind pair is checked against the MERGED row (previous +
 * this patch), the same way contracts/[id]/payments/[pid] merges status and
 * paidOn: `PATCH { pricingKind: "fixed" }` alone against a row that was
 * "quote" with price_sar null must fail with the Arabic price message, not
 * with a raw 23514 from lawyer_services_price_pair_check.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const { data: currentData, error: readError } = await supabase
      .from("lawyer_services")
      .select(SERVICE_SELECT)
      .eq("id", id)
      .eq("lawyer_user_id", user.id)
      .maybeSingle();
    if (readError) {
      console.error("[lawyer/services/[id] PATCH] read failed:", readError.message, readError.code);
      return NextResponse.json({ error: "تعذّر تحميل الخدمة." }, { status: 500 });
    }
    if (!currentData) return NextResponse.json({ error: "الخدمة غير موجودة" }, { status: 404 });
    const current = currentData as unknown as LawyerServiceRow;

    const body = (await request.json()) as UpdateBody;
    const patch: Record<string, unknown> = {};

    if (body.titleAr !== undefined) {
      const titleAr = typeof body.titleAr === "string" ? body.titleAr.trim() : "";
      if (titleAr.length < 2 || titleAr.length > 120) {
        return NextResponse.json({ error: "عنوان الخدمة يجب أن يكون بين حرفين و١٢٠ حرفاً." }, { status: 400 });
      }
      const titleIssue = offPlatformContactIssue(titleAr);
      if (titleIssue) return NextResponse.json({ error: titleIssue }, { status: 400 });
      patch.title_ar = titleAr;
    }

    if (body.descriptionAr !== undefined) {
      const descriptionAr = typeof body.descriptionAr === "string" ? body.descriptionAr.trim() : "";
      const descriptionIssue = offPlatformContactIssue(descriptionAr);
      if (descriptionIssue) return NextResponse.json({ error: descriptionIssue }, { status: 400 });
      patch.description_ar = descriptionAr;
    }

    // pricing_kind / price_sar — validated together against the MERGED row.
    let nextPricingKind = current.pricing_kind as PricingKind;
    if (body.pricingKind !== undefined) {
      if (!isPricingKind(body.pricingKind)) {
        return NextResponse.json({ error: "نوع التسعير غير صالح." }, { status: 400 });
      }
      nextPricingKind = body.pricingKind;
    }

    let nextPriceSar = num(current.price_sar);
    let priceSarTouched = false;
    if (body.priceSar !== undefined) {
      if (
        body.priceSar !== null &&
        (typeof body.priceSar !== "number" || !Number.isFinite(body.priceSar) || body.priceSar < 0)
      ) {
        return NextResponse.json({ error: "السعر يجب أن يكون صفراً أو أكثر." }, { status: 400 });
      }
      nextPriceSar = body.priceSar;
      priceSarTouched = true;
    } else if (body.pricingKind !== undefined && nextPricingKind === "quote") {
      // switching to "quote" without an explicit price clears a stale amount
      // left over from a previous fixed/from/hourly pricing.
      nextPriceSar = null;
      priceSarTouched = true;
    }

    if (nextPricingKind !== "quote" && (typeof nextPriceSar !== "number" || !Number.isFinite(nextPriceSar) || nextPriceSar < 0)) {
      return NextResponse.json({ error: "السعر مطلوب ويجب أن يكون صفراً أو أكثر." }, { status: 400 });
    }

    if (body.pricingKind !== undefined) patch.pricing_kind = nextPricingKind;
    if (priceSarTouched) patch.price_sar = nextPriceSar;

    if (body.category !== undefined) {
      if (!isServiceCategory(body.category)) {
        return NextResponse.json({ error: "فئة الخدمة غير صالحة." }, { status: 400 });
      }
      patch.category = body.category;
    }

    if (body.durationLabel !== undefined) {
      if (body.durationLabel === null) {
        patch.duration_label = null;
      } else {
        const trimmed = typeof body.durationLabel === "string" ? body.durationLabel.trim() : "";
        if (trimmed.length > 40) {
          return NextResponse.json({ error: "مدة الخدمة يجب ألا تتجاوز ٤٠ حرفاً." }, { status: 400 });
        }
        const durationIssue = trimmed ? offPlatformContactIssue(trimmed) : null;
        if (durationIssue) return NextResponse.json({ error: durationIssue }, { status: 400 });
        patch.duration_label = trimmed || null;
      }
    }

    if (body.active !== undefined) patch.active = !!body.active;

    if (body.position !== undefined) {
      if (!Number.isInteger(body.position) || body.position < 0) {
        return NextResponse.json({ error: "الترتيب يجب أن يكون رقماً صحيحاً." }, { status: 400 });
      }
      patch.position = body.position;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "لا يوجد ما يُحدَّث" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("lawyer_services")
      .update(patch)
      .eq("id", id)
      .eq("lawyer_user_id", user.id)
      .select(SERVICE_SELECT)
      .maybeSingle();

    if (error) {
      console.error("[lawyer/services/[id] PATCH] update failed:", error.message, error.code);
      const { status: httpStatus, message } = dbErrorResponse(error);
      return NextResponse.json({ error: message }, { status: httpStatus });
    }
    if (!data) return NextResponse.json({ error: "الخدمة غير موجودة" }, { status: 404 });

    return NextResponse.json({ data: toServiceDto(data as unknown as LawyerServiceRow) });
  } catch (err) {
    console.error("[lawyer/services/[id] PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/lawyer/services/[id] — 0 rows → 404. Response: { ok: true }.
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const { error, count } = await supabase
      .from("lawyer_services")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("lawyer_user_id", user.id);

    if (error) {
      console.error("[lawyer/services/[id] DELETE] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر حذف الخدمة." }, { status: 500 });
    }
    if (!count) return NextResponse.json({ error: "الخدمة غير موجودة" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[lawyer/services/[id] DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حذف الخدمة." }, { status: 500 });
  }
}
