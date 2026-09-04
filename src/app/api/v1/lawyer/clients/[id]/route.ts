import { NextResponse, NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import {
  isClientFlag, isValidNationalId, isValidCommercialRegister,
  isValidTaxNumber, isValidUnifiedNumber700, isRatingFigure, feePairIssue,
} from "@/lib/services/clientIdentityRules";
import { hashNationalId, normalizedCommercialRegister } from "@/lib/services/clientIdentityHash";
import {
  CARD_SELECT, cardToDto, foldRequest, zeroStats, dbErrorResponse, digitsOnly,
  type CardRow, type Stats,
} from "../route";
import { assertLinkableAccount, propagateLink } from "../_link";

/**
 * /api/v1/lawyer/clients/[id] — single-client read/update, Phase 2.
 * See ../route.ts for the migration this is backed by and the two-source
 * ("card"/"profile") model this route also has to answer for: `id` here may
 * be a `lawyer_clients` row id, OR a platform account's user id that has no
 * card yet (a "profile" row from the list). Only the former is patchable.
 */

async function statsForCard(
  supabase: SupabaseClient,
  uid: string,
  card: CardRow,
): Promise<Stats> {
  const orClauses = [`lawyer_client_id.eq.${card.id}`];
  if (card.client_user_id) orClauses.push(`requester_user_id.eq.${card.client_user_id}`);

  const { data: requests, error } = await supabase
    .from("service_requests")
    .select("status, created_at")
    .eq("assigned_to", uid)
    .or(orClauses.join(","));

  if (error) {
    console.error("[lawyer/clients/[id]] stats query failed:", error.message, error.code);
    return zeroStats();
  }

  let stats = zeroStats();
  for (const req of requests ?? []) {
    stats = foldRequest(stats, req.status as string, req.created_at as string);
  }
  return stats;
}

/**
 * GET /api/v1/lawyer/clients/[id] → { data } or 404 { error }.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const uid = user.id;
    const { id } = await context.params;

    const { data: card, error: cardError } = await supabase
      .from("lawyer_clients")
      .select(CARD_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (cardError) {
      console.error("[lawyer/clients/[id] GET] card query failed:", cardError.message, cardError.code);
      return NextResponse.json({ error: "تعذّر تحميل بيانات الموكّل." }, { status: 500 });
    }

    if (card) {
      const stats = await statsForCard(supabase, uid, card as CardRow);
      return NextResponse.json({ data: cardToDto(card as CardRow, stats) });
    }

    // No card by this id — it may still be a "profile" client: a platform
    // account with requests assigned to this lawyer, never turned into a card.
    if (id !== uid) {
      const { data: requests, error: reqError } = await supabase
        .from("service_requests")
        .select("status, created_at")
        .eq("assigned_to", uid)
        .eq("requester_user_id", id);

      if (reqError) {
        console.error("[lawyer/clients/[id] GET] profile requests query failed:", reqError.message, reqError.code);
        return NextResponse.json({ error: "تعذّر تحميل بيانات الموكّل." }, { status: 500 });
      }

      if (requests && requests.length > 0) {
        const service = await createServiceClient();
        const { data: profile, error: profileError } = await service
          .from("profiles")
          .select("id, display_name, email, phone")
          .eq("id", id)
          .maybeSingle();

        if (profileError) {
          console.error("[lawyer/clients/[id] GET] profile lookup failed:", profileError.message, profileError.code);
          return NextResponse.json({ error: "تعذّر تحميل بيانات الموكّل." }, { status: 500 });
        }

        if (profile) {
          let stats = zeroStats();
          for (const req of requests) {
            stats = foldRequest(stats, req.status as string, req.created_at as string);
          }
          return NextResponse.json({
            data: {
              id: profile.id,
              source: "profile" as const,
              clientUserId: profile.id,
              firmId: null,
              clientType: null,
              name: profile.display_name || "عميل نظامي",
              phone: profile.phone,
              email: profile.email,
              city: null,
              hasNationalId: false,
              powerOfAttorneyNo: null,
              commercialRegisterNo: null,
              taxNumber: null,
              unifiedNumber700: null,
              flags: [],
              rating: null,
              feeTotalSar: null,
              feePaidSar: null,
              firstEngagementOn: null,
              status: "active",
              requestCount: stats.requestCount,
              activeCount: stats.activeCount,
              closedCount: stats.closedCount,
              lastActivity: stats.lastActivity,
              createdAt: null,
            },
          });
        }
      }
    }

    return NextResponse.json({ error: "الموكّل غير موجود." }, { status: 404 });
  } catch (err) {
    console.error("[lawyer/clients/[id] GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل بيانات الموكّل." }, { status: 500 });
  }
}

/**
 * PATCH /api/v1/lawyer/clients/[id] → { data }.
 * Only a "card" (a `lawyer_clients` row) is patchable — a "profile" id
 * (see GET above) has none yet and 404s here exactly as it would for any
 * other nonexistent row; POST with `clientUserId` is what creates its card.
 * Partial: only keys present in the body are validated and written. A
 * `nationalId` in the body re-hashes; an empty string on any optional field
 * clears it to NULL.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const uid = user.id;
    const { id } = await context.params;

    const { data: existing, error: existingError } = await supabase
      .from("lawyer_clients")
      .select(CARD_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      console.error("[lawyer/clients/[id] PATCH] lookup failed:", existingError.message, existingError.code);
      return NextResponse.json({ error: "تعذّر تحميل بيانات الموكّل." }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "الموكّل غير موجود." }, { status: 404 });
    }
    const existingCard = existing as CardRow;

    const body = await request.json();
    const {
      name, clientType, phone, email, city, nationalId,
      powerOfAttorneyNo, commercialRegisterNo, taxNumber, unifiedNumber700,
      flags, rating, feeTotalSar, feePaidSar, firstEngagementOn, clientUserId, status,
    } = body as {
      name?: string; clientType?: string; phone?: string | null; email?: string | null; city?: string | null;
      nationalId?: string | null; powerOfAttorneyNo?: string | null; commercialRegisterNo?: string | null;
      taxNumber?: string | null; unifiedNumber700?: string | null; flags?: string[];
      rating?: number | null; feeTotalSar?: number | null; feePaidSar?: number | null;
      firstEngagementOn?: string | null; clientUserId?: string | null; status?: string;
    };

    const patch: Record<string, unknown> = {};

    if (name !== undefined) {
      if (!name || !name.trim()) {
        return NextResponse.json({ error: "اسم الموكّل مطلوب." }, { status: 400 });
      }
      patch.name = name.trim();
    }
    if (clientType !== undefined) {
      if (clientType !== "individual" && clientType !== "company") {
        return NextResponse.json({ error: "نوع الموكّل مطلوب (فرد أو شركة)." }, { status: 400 });
      }
      patch.client_type = clientType;
    }
    if (status !== undefined) {
      if (!["active", "inactive", "archived"].includes(status)) {
        return NextResponse.json({ error: "حالة الموكّل غير صالحة." }, { status: 400 });
      }
      patch.status = status;
    }
    if (phone !== undefined) patch.phone = phone?.trim() || null;
    if (email !== undefined) patch.email = email?.trim() || null;
    if (city !== undefined) patch.city = city?.trim() || null;
    // linkTargetUserId is set ONLY when this PATCH performs a fresh LINK —
    // that is what triggers propagation below. An unlink (null/"") clears
    // the card's own link but never touches anything downstream: a shared
    // contract stays shared once made, so nothing is un-propagated here.
    let linkTargetUserId: string | null = null;
    if (clientUserId !== undefined) {
      if (!clientUserId) {
        patch.client_user_id = null;
      } else {
        const linkCheck = await assertLinkableAccount(supabase, uid, clientUserId, id);
        if (!linkCheck.ok) {
          const errorBody: Record<string, unknown> = { error: linkCheck.error };
          if (linkCheck.cardId) errorBody.cardId = linkCheck.cardId;
          return NextResponse.json(errorBody, { status: linkCheck.status });
        }
        patch.client_user_id = clientUserId;
        linkTargetUserId = clientUserId;
      }
    }

    if (nationalId !== undefined) {
      if (!nationalId) {
        patch.national_id_hash = null;
      } else if (!isValidNationalId(nationalId)) {
        return NextResponse.json({ error: "رقم الهوية غير صالح — ١٠ أرقام تبدأ بـ١ أو ٢" }, { status: 400 });
      } else {
        patch.national_id_hash = hashNationalId(nationalId);
      }
    }
    if (powerOfAttorneyNo !== undefined) patch.power_of_attorney_no = powerOfAttorneyNo?.trim() || null;
    if (commercialRegisterNo !== undefined) {
      if (!commercialRegisterNo) {
        patch.commercial_register_no = null;
      } else if (!isValidCommercialRegister(commercialRegisterNo)) {
        return NextResponse.json({ error: "رقم السجل التجاري غير صالح — يجب أن يتكوّن من ١٠ أرقام." }, { status: 400 });
      } else {
        patch.commercial_register_no = normalizedCommercialRegister(commercialRegisterNo);
      }
    }
    if (taxNumber !== undefined) {
      if (!taxNumber) {
        patch.tax_number = null;
      } else if (!isValidTaxNumber(taxNumber)) {
        return NextResponse.json({ error: "الرقم الضريبي غير صالح — يجب أن يتكوّن من ١٥ رقمًا ويبدأ بـ٣." }, { status: 400 });
      } else {
        patch.tax_number = digitsOnly(taxNumber);
      }
    }
    if (unifiedNumber700 !== undefined) {
      if (!unifiedNumber700) {
        patch.unified_number_700 = null;
      } else if (!isValidUnifiedNumber700(unifiedNumber700)) {
        return NextResponse.json({ error: "الرقم الموحّد غير صالح — يجب أن يتكوّن من ١٠ أرقام ويبدأ بـ٧." }, { status: 400 });
      } else {
        patch.unified_number_700 = digitsOnly(unifiedNumber700);
      }
    }
    if (flags !== undefined) {
      patch.flags = Array.isArray(flags) ? flags.filter(isClientFlag) : [];
    }
    if (rating !== undefined) {
      if (rating === null) {
        patch.rating = null;
      } else if (!isRatingFigure(rating)) {
        return NextResponse.json({ error: "التقييم يجب أن يكون رقمًا صحيحًا من ١ إلى ٥." }, { status: 400 });
      } else {
        patch.rating = rating;
      }
    }
    if (firstEngagementOn !== undefined) {
      if (!firstEngagementOn) {
        patch.first_engagement_on = null;
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(firstEngagementOn)) {
        return NextResponse.json({ error: "تاريخ بدء التعامل يجب أن يكون بصيغة YYYY-MM-DD." }, { status: 400 });
      } else {
        patch.first_engagement_on = firstEngagementOn;
      }
    }

    // The fee pair is validated as a pair against the EFFECTIVE state — the
    // patched value where one is sent, the row's current value otherwise —
    // so a PATCH touching only feePaidSar is still checked against the total
    // already on record, not against `undefined`.
    const effectiveTotal = feeTotalSar !== undefined ? feeTotalSar : existingCard.fee_total_sar;
    const effectivePaid = feePaidSar !== undefined ? feePaidSar : existingCard.fee_paid_sar;
    const feeIssue = feePairIssue(effectiveTotal, effectivePaid);
    if (feeIssue) return NextResponse.json({ error: feeIssue }, { status: 400 });
    if (feeTotalSar !== undefined) patch.fee_total_sar = feeTotalSar;
    if (feePaidSar !== undefined) patch.fee_paid_sar = feePaidSar;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "لا توجد بيانات لتحديثها." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("lawyer_clients")
      .update(patch)
      .eq("id", id)
      .select(CARD_SELECT)
      .single();

    if (error || !data) {
      const { status: httpStatus, message } = dbErrorResponse(error);
      console.error("[lawyer/clients/[id] PATCH] update error:", error?.message, error?.details, error?.code);
      return NextResponse.json({ error: message }, { status: httpStatus });
    }

    const updatedCard = data as CardRow;
    const linked = linkTargetUserId ? await propagateLink(supabase, updatedCard.id, linkTargetUserId) : null;
    const stats = await statsForCard(supabase, uid, updatedCard);
    return NextResponse.json({ data: cardToDto(updatedCard, stats), linked });
  } catch (err) {
    console.error("[lawyer/clients/[id] PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حفظ التعديلات." }, { status: 500 });
  }
}
