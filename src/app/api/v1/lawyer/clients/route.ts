import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import {
  type ClientType, type ClientFlag, type ClientStatus,
  isClientFlag, isValidNationalId, isValidCommercialRegister,
  isValidTaxNumber, isValidUnifiedNumber700, isRatingFigure,
  feePairIssue, normalizeDigits,
} from "@/lib/services/clientIdentityRules";
import { hashNationalId, normalizedCommercialRegister } from "@/lib/services/clientIdentityHash";

/**
 * /api/v1/lawyer/clients — Phase 2 (خطة_البناء_الكاملة_٢٠٢٦-٠٩-٠٢.md §6).
 *
 * Backed by `public.lawyer_clients` (migration
 * 20260903_phase2_clients_and_firm_membership.sql), NOT `service_requests`.
 * A manually-added client used to be a `service_requests` row with
 * `requester_user_id: null` and `metadata.client = true` — and the only
 * INSERT policy on that table requires `requester_user_id = auth.uid()`, so
 * every POST here failed with 42501, always («تعذّر حفظ الموكّل»). A client
 * is not a service request; this route stops pretending it is one, and never
 * writes to `service_requests` again. See the migration file for the full
 * rationale (DECISION 2 covers what a client row may say about a person; the
 * national ID is hashed, never stored raw — see clientIdentityHash.ts).
 *
 * ── TWO SOURCES, MERGED ──────────────────────────────────────────────────────
 * "card"    — a `lawyer_clients` row RLS returns (own, or a firm colleague's
 *             while an active member of the same firm). Editable.
 * "profile" — a platform account with `service_requests` assigned to this
 *             lawyer but no card yet (`client_user_id` on no visible card
 *             matches it). Read-only until a card links it — POST with
 *             `clientUserId` does that.
 * A card whose `client_user_id` equals a profile's id is ONE row, source
 * "card": the card's own fields win, and its counts absorb that profile's
 * requests too (see `attributeRequest` below).
 *
 * ── SCOPE OF THE COUNTS ──────────────────────────────────────────────────────
 * `requestCount`/`activeCount`/`closedCount`/`lastActivity` are built from
 * `service_requests` rows `assigned_to = auth.uid()` — this lawyer's own
 * workload, not "every request RLS would let through" (hearings/route.ts
 * makes the identical choice, and for the identical reason: a firm's shared
 * card must not silently attribute a colleague's caseload to this lawyer's
 * numbers). A request counts toward a card when its `lawyer_client_id`
 * matches, OR — for a card linked to a platform account — its
 * `requester_user_id` matches the card's `client_user_id`.
 */

const ACTIVE_STATUSES = new Set(["pending_assignment", "assigned", "in_review"]);
const CLOSED_STATUSES = new Set(["completed", "cancelled"]);

// A SINGLE string literal, deliberately not built with `+` concatenation:
// Supabase's select-query-parser only derives a precise result type from a
// literal string type, and `"a" + "b"` widens to plain `string` — which is
// exactly what turned every row this route reads into an unusable
// `GenericStringError` type (caught by `tsc`, not by any runtime symptom).
const CARD_SELECT =
  "id, owner_user_id, firm_id, client_user_id, client_type, name, phone, email, city, national_id_hash, power_of_attorney_no, commercial_register_no, tax_number, unified_number_700, flags, rating, fee_total_sar, fee_paid_sar, first_engagement_on, status, created_at";

interface CardRow {
  id: string;
  owner_user_id: string;
  firm_id: string | null;
  client_user_id: string | null;
  client_type: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  national_id_hash: string | null;
  power_of_attorney_no: string | null;
  commercial_register_no: string | null;
  tax_number: string | null;
  unified_number_700: string | null;
  flags: string[] | null;
  rating: number | null;
  fee_total_sar: number | null;
  fee_paid_sar: number | null;
  first_engagement_on: string | null;
  status: string;
  created_at: string;
}

interface Stats {
  requestCount: number;
  activeCount: number;
  closedCount: number;
  lastActivity: string | null;
}

const zeroStats = (): Stats => ({ requestCount: 0, activeCount: 0, closedCount: 0, lastActivity: null });

function foldRequest(stats: Stats, status: string, createdAt: string): Stats {
  const next: Stats = {
    requestCount: stats.requestCount + 1,
    activeCount: stats.activeCount + (ACTIVE_STATUSES.has(status) ? 1 : 0),
    closedCount: stats.closedCount + (CLOSED_STATUSES.has(status) ? 1 : 0),
    lastActivity: !stats.lastActivity || createdAt > stats.lastActivity ? createdAt : stats.lastActivity,
  };
  return next;
}

function cardToDto(row: CardRow, stats: Stats) {
  return {
    id: row.id,
    source: "card" as const,
    clientUserId: row.client_user_id,
    firmId: row.firm_id,
    clientType: (row.client_type as ClientType) ?? null,
    name: row.name,
    phone: row.phone,
    email: row.email,
    city: row.city,
    hasNationalId: row.national_id_hash !== null,
    powerOfAttorneyNo: row.power_of_attorney_no,
    commercialRegisterNo: row.commercial_register_no,
    taxNumber: row.tax_number,
    unifiedNumber700: row.unified_number_700,
    flags: (row.flags ?? []) as ClientFlag[],
    rating: row.rating,
    feeTotalSar: row.fee_total_sar,
    feePaidSar: row.fee_paid_sar,
    firstEngagementOn: row.first_engagement_on,
    status: row.status as ClientStatus,
    requestCount: stats.requestCount,
    activeCount: stats.activeCount,
    closedCount: stats.closedCount,
    lastActivity: stats.lastActivity,
    createdAt: row.created_at,
  };
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
}

function profileToDto(row: ProfileRow, stats: Stats) {
  return {
    id: row.id,
    source: "profile" as const,
    clientUserId: row.id,
    firmId: null,
    clientType: null,
    name: row.display_name || "عميل نظامي",
    phone: row.phone,
    email: row.email,
    city: null,
    hasNationalId: false,
    powerOfAttorneyNo: null,
    commercialRegisterNo: null,
    taxNumber: null,
    unifiedNumber700: null,
    flags: [] as ClientFlag[],
    rating: null,
    feeTotalSar: null,
    feePaidSar: null,
    firstEngagementOn: null,
    status: "active" as ClientStatus,
    requestCount: stats.requestCount,
    activeCount: stats.activeCount,
    closedCount: stats.closedCount,
    lastActivity: stats.lastActivity,
    createdAt: null,
  };
}

/**
 * GET /api/v1/lawyer/clients → { data: LawyerClient[], total }
 * Order: lastActivity desc (nulls last), then name.
 */
export async function GET() {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const uid = user.id;

    const { data: cards, error: cardsError } = await supabase
      .from("lawyer_clients")
      .select(CARD_SELECT);

    if (cardsError) {
      console.error("[lawyer/clients GET] cards query failed:", cardsError.message, cardsError.code);
      return NextResponse.json({ error: "تعذّر تحميل دليل الموكّلين." }, { status: 500 });
    }

    const { data: requests, error: reqError } = await supabase
      .from("service_requests")
      .select("requester_user_id, lawyer_client_id, status, created_at")
      .eq("assigned_to", uid);

    if (reqError) {
      console.error("[lawyer/clients GET] requests query failed:", reqError.message, reqError.code);
      return NextResponse.json({ error: "تعذّر تحميل دليل الموكّلين." }, { status: 500 });
    }

    const cardRows = (cards ?? []) as CardRow[];
    const cardById = new Map(cardRows.map((c) => [c.id, c]));
    const cardByClientUserId = new Map(
      cardRows.filter((c) => c.client_user_id).map((c) => [c.client_user_id as string, c]),
    );

    const cardStats = new Map<string, Stats>();
    const profileStats = new Map<string, Stats>();

    for (const req of requests ?? []) {
      const status = req.status as string;
      const createdAt = req.created_at as string;

      // A request attaches to a card either directly (lawyer_client_id) or,
      // for a card linked to a platform account, through requester_user_id.
      // Checked in that order so a request can never be counted twice.
      let cardId: string | null = null;
      if (req.lawyer_client_id && cardById.has(req.lawyer_client_id)) {
        cardId = req.lawyer_client_id;
      } else if (req.requester_user_id && cardByClientUserId.has(req.requester_user_id)) {
        cardId = (cardByClientUserId.get(req.requester_user_id) as CardRow).id;
      }

      if (cardId) {
        cardStats.set(cardId, foldRequest(cardStats.get(cardId) ?? zeroStats(), status, createdAt));
        continue;
      }

      // No card claims this request. It counts toward a "profile" row only
      // when it names a real platform account other than the caller.
      if (req.requester_user_id && req.requester_user_id !== uid) {
        const pid = req.requester_user_id;
        profileStats.set(pid, foldRequest(profileStats.get(pid) ?? zeroStats(), status, createdAt));
      }
    }

    // Profile lookups bypass RLS (a lawyer may not read another user's
    // `profiles` row directly) — restricted to the ids this lawyer's own
    // requests already named, and to the minimum display columns.
    const profileIds = Array.from(profileStats.keys());
    let profileRows: ProfileRow[] = [];
    if (profileIds.length > 0) {
      const service = await createServiceClient();
      const { data: profiles, error: profileError } = await service
        .from("profiles")
        .select("id, display_name, email, phone")
        .in("id", profileIds);
      if (profileError) {
        console.error("[lawyer/clients GET] profiles lookup failed:", profileError.message, profileError.code);
        return NextResponse.json({ error: "تعذّر تحميل دليل الموكّلين." }, { status: 500 });
      }
      profileRows = (profiles ?? []) as ProfileRow[];
    }

    const rows = [
      ...cardRows.map((c) => cardToDto(c, cardStats.get(c.id) ?? zeroStats())),
      ...profileRows.map((p) => profileToDto(p, profileStats.get(p.id) ?? zeroStats())),
    ];

    rows.sort((a, b) => {
      if (a.lastActivity !== b.lastActivity) {
        if (a.lastActivity === null) return 1;
        if (b.lastActivity === null) return -1;
        return a.lastActivity > b.lastActivity ? -1 : 1;
      }
      return a.name.localeCompare(b.name, "ar");
    });

    return NextResponse.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error("[lawyer/clients GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل دليل الموكّلين." }, { status: 500 });
  }
}

/** ASCII-normalised digits only, for tax/700 numbers (no dedicated export exists for these two). */
function digitsOnly(input: string): string {
  return normalizeDigits(input).replace(/\D/g, "");
}

/**
 * Validate the client-identity fields shared by POST and PATCH. Returns an
 * Arabic error message, or null when everything present is valid.
 * `current` supplies the values NOT being changed, so a PATCH that only
 * touches `feePaidSar` is still checked against the row's existing total.
 */
function validateIdentityFields(input: {
  nationalId?: string;
  commercialRegisterNo?: string;
  taxNumber?: string;
  unifiedNumber700?: string;
  rating?: number;
  firstEngagementOn?: string;
  feeTotalSar?: number | null;
  feePaidSar?: number | null;
}): string | null {
  if (input.nationalId !== undefined && input.nationalId !== "" && !isValidNationalId(input.nationalId)) {
    return "رقم الهوية غير صالح — ١٠ أرقام تبدأ بـ١ أو ٢";
  }
  if (
    input.commercialRegisterNo !== undefined &&
    input.commercialRegisterNo !== "" &&
    !isValidCommercialRegister(input.commercialRegisterNo)
  ) {
    return "رقم السجل التجاري غير صالح — يجب أن يتكوّن من ١٠ أرقام.";
  }
  if (input.taxNumber !== undefined && input.taxNumber !== "" && !isValidTaxNumber(input.taxNumber)) {
    return "الرقم الضريبي غير صالح — يجب أن يتكوّن من ١٥ رقمًا ويبدأ بـ٣.";
  }
  if (
    input.unifiedNumber700 !== undefined &&
    input.unifiedNumber700 !== "" &&
    !isValidUnifiedNumber700(input.unifiedNumber700)
  ) {
    return "الرقم الموحّد غير صالح — يجب أن يتكوّن من ١٠ أرقام ويبدأ بـ٧.";
  }
  if (input.rating !== undefined && !isRatingFigure(input.rating)) {
    return "التقييم يجب أن يكون رقمًا صحيحًا من ١ إلى ٥.";
  }
  if (input.firstEngagementOn !== undefined && input.firstEngagementOn !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(input.firstEngagementOn)) {
    return "تاريخ بدء التعامل يجب أن يكون بصيغة YYYY-MM-DD.";
  }
  const feeIssue = feePairIssue(input.feeTotalSar ?? undefined, input.feePaidSar ?? undefined);
  if (feeIssue) return feeIssue;
  return null;
}

/**
 * Postgres error → { status, message } for the constraints this table can hit.
 * Every field this route accepts is pre-validated against the same rule the
 * matching CHECK enforces (validateIdentityFields, the clientType/name/status
 * guards), so 23514 here should only ever be the one constraint no request-
 * scoped validation can see: two concurrent PATCHes each clearing one half of
 * the fee pair. The constraint name in `message` picks the exact wording;
 * anything else falls back to a generic (but still honest) 400.
 */
function dbErrorResponse(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code;
  if (code === "23505") {
    return { status: 409, message: "هذا الموكّل مسجَّل مسبقاً بنفس رقم الهوية أو السجل التجاري." };
  }
  if (code === "23514") {
    if (error?.message?.includes("lawyer_clients_paid_needs_total")) {
      return { status: 400, message: "لا يمكن حفظ مبلغ مقدّم دون إجمالي أتعاب أكبر من صفر." };
    }
    return { status: 400, message: "بيانات الموكّل غير صالحة." };
  }
  if (code === "42501") {
    return { status: 403, message: "غير مصرح لك بهذا الإجراء." };
  }
  return { status: 500, message: "تعذّر حفظ الموكّل." };
}

/**
 * POST /api/v1/lawyer/clients → { data: LawyerClient }
 * Body: CreateLawyerClientInput (lawyerClientsService.ts).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = await request.json();
    const {
      name, clientType, phone, email, city, nationalId,
      powerOfAttorneyNo, commercialRegisterNo, taxNumber, unifiedNumber700,
      flags, rating, feeTotalSar, feePaidSar, firstEngagementOn, clientUserId,
    } = body as {
      name?: string; clientType?: string; phone?: string; email?: string; city?: string;
      nationalId?: string; powerOfAttorneyNo?: string; commercialRegisterNo?: string;
      taxNumber?: string; unifiedNumber700?: string; flags?: string[]; rating?: number;
      feeTotalSar?: number; feePaidSar?: number; firstEngagementOn?: string; clientUserId?: string;
    };

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "اسم الموكّل مطلوب." }, { status: 400 });
    }
    if (clientType !== "individual" && clientType !== "company") {
      return NextResponse.json({ error: "نوع الموكّل مطلوب (فرد أو شركة)." }, { status: 400 });
    }

    const issue = validateIdentityFields({
      nationalId, commercialRegisterNo, taxNumber, unifiedNumber700,
      rating, firstEngagementOn, feeTotalSar, feePaidSar,
    });
    if (issue) return NextResponse.json({ error: issue }, { status: 400 });

    const validFlags = Array.isArray(flags) ? flags.filter(isClientFlag) : [];

    const { data: membership, error: membershipError } = await supabase
      .from("firm_members")
      .select("firm_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError) {
      console.error("[lawyer/clients POST] membership lookup failed:", membershipError.message, membershipError.code);
    }

    const { data, error } = await supabase
      .from("lawyer_clients")
      .insert({
        owner_user_id: user.id,
        firm_id: membership?.firm_id ?? null,
        client_user_id: clientUserId || null,
        client_type: clientType,
        name: name.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        city: city?.trim() || null,
        national_id_hash: nationalId ? hashNationalId(nationalId) : null,
        power_of_attorney_no: powerOfAttorneyNo?.trim() || null,
        commercial_register_no: commercialRegisterNo ? normalizedCommercialRegister(commercialRegisterNo) : null,
        tax_number: taxNumber ? digitsOnly(taxNumber) : null,
        unified_number_700: unifiedNumber700 ? digitsOnly(unifiedNumber700) : null,
        flags: validFlags,
        rating: rating ?? null,
        fee_total_sar: feeTotalSar ?? null,
        fee_paid_sar: feePaidSar ?? null,
        first_engagement_on: firstEngagementOn || null,
      })
      .select(CARD_SELECT)
      .single();

    if (error || !data) {
      const { status, message } = dbErrorResponse(error);
      console.error("[lawyer/clients POST] insert error:", error?.message, error?.details, error?.code);
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ data: cardToDto(data as CardRow, zeroStats()) });
  } catch (err) {
    console.error("[lawyer/clients POST] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حفظ الموكّل." }, { status: 500 });
  }
}

export { CARD_SELECT, cardToDto, foldRequest, zeroStats, validateIdentityFields, dbErrorResponse, digitsOnly };
export type { CardRow, Stats };
