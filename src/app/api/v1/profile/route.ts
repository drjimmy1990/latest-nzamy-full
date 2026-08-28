import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ─── Arabic error copy ────────────────────────────────────────────────────────
// Every message this route can return reaches a user: the lawyer profile editor
// renders `err.message` straight into the page
// (src/app/dashboard/lawyer/profile/edit/page.tsx:92), and the onboarding wizard
// renders the `error` field of the body. So no English and no raw Postgres text
// leaves this file — those go to the server log instead.
const AR = {
  unauthorized: "يجب تسجيل الدخول للمتابعة.",
  profileNotFound: "لم نعثر على ملفك الشخصي.",
  // Distinct from `profileNotFound` ON PURPOSE. "We could not read it" and "it
  // does not exist" are different facts, and only one of them is the user's
  // problem. See the PGRST116 branch below.
  readFailed: "حدث خطأ أثناء قراءة بياناتك من الخادم.",
  noFields: "لا توجد حقول صالحة للتحديث.",
  badPhone: "رقم الجوال غير صحيح. أدخل رقم جوال سعودي يبدأ بـ 05 — مثال: 0512345678",
  badOnboardingFlag: "قيمة حالة إكمال الإعداد غير صالحة.",
  lawyerFieldsOnly: "هذه الحقول متاحة لحسابات المحامين فقط.",
  saveFailed: "تعذّر حفظ التعديلات. حاول مرة أخرى.",
} as const;

/**
 * Arabic-Indic (٠١٢…) and Extended Arabic-Indic (۰۱۲…) digits → ASCII.
 *
 * A Saudi user on an Arabic keyboard types ٠٥١٢٣٤٥٦٧٨. Without this the
 * required phone field would refuse a number the user considers correct.
 */
function toAsciiDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/**
 * A Saudi mobile number in E.164 (`+9665XXXXXXXX`), or `null` when the input is
 * not one.
 *
 * Accepts what people actually type — Arabic-Indic digits, spaces, dashes, and
 * a `05`, `5`, `966`, `00966` or `+966` prefix — and stores exactly one shape.
 *
 * It refuses rather than storing anything it cannot dial: `profiles.phone` is
 * the only number the outbound notification payload carries
 * (src/lib/n8n/payload.ts:214,218), and a junk value there would satisfy the
 * onboarding gate's non-empty check (src/lib/auth/onboardingGate.ts) while
 * being unreachable — strictly worse than leaving the column NULL, which at
 * least keeps the gate asking.
 *
 * Saudi mobiles only. A user whose only mobile is foreign cannot pass this, and
 * that is a stated limitation, not an oversight.
 *
 * NOTE: duplicated, deliberately, in src/app/onboarding/page.tsx so the wizard
 * can validate before it submits. The two copies must stay identical; if a
 * third caller appears, extract them into one module.
 */
function normalizeSaudiMobile(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Strip spaces, dashes, brackets and the bidi marks a copy-paste from an RTL
  // page can carry along.
  let v = toAsciiDigits(raw).replace(/[\s()\u200e\u200f-]/g, "");
  if (v.startsWith("00966")) v = `+${v.slice(2)}`;
  else if (v.startsWith("966")) v = `+${v}`;
  else if (/^0?5\d{8}$/.test(v)) v = `+966${v.replace(/^0/, "")}`;
  return /^\+9665\d{8}$/.test(v) ? v : null;
}

/**
 * GET /api/v1/profile — Get current user's profile
 *
 * 200 body: `{ profile, roleProfile, roleProfileReadFailed, subscription }`.
 *
 * `roleProfileReadFailed` exists because `roleProfile: null` used to mean two
 * incompatible things. supabase-js does NOT throw when a read fails — a
 * transport failure, a timeout or a Postgres error all come back as
 * `{ data: null, error }` — and this handler discarded that `error`, so "this
 * lawyer has no lawyer_profiles row" and "we could not read his
 * lawyer_profiles row" both left here as HTTP 200 + null. The profile page
 * then rendered «لم تُضَف نبذة مهنية بعد.» — a claim about what the LAWYER did
 * — over a bio it had simply failed to fetch.
 *
 * WHAT THE MARKER DOES NOT COVER: an RLS-filtered SELECT. A policy that
 * excludes the row does not raise — PostgREST returns zero rows — so it arrives
 * as `{ data: null, error: null }` and is reported here as "no row", with the
 * marker false. That is deliberate and not a gap being papered over: from this
 * caller's authorization view there is no row to see, and "absent" is the only
 * thing the client could honestly be told. Do not read this marker as a
 * guarantee that a null roleProfile means the row is truly absent from the
 * table.
 *
 * WHY A MARKER RATHER THAN A 500 for that sub-query. `profile` itself was read
 * successfully, and two of the three callers want only that:
 *   • src/app/onboarding/page.tsx:846 types the envelope as `{ profile }` and
 *     ignores roleProfile entirely; its catch leaves the wizard on step 1. A
 *     500 here would therefore re-ask an established lawyer «من أنت؟» and drop
 *     his phone/city prefill because a DIFFERENT table was unreadable.
 *   • src/app/dashboard/lawyer/profile/edit/page.tsx:102 already treats
 *     `roleProfile == null` as "cannot read — save disabled", which is what
 *     stops a blank form from overwriting a real licence number. The marker
 *     leaves that path byte-identical.
 * Neither file is in this change's scope, so the fix had to be additive. A new
 * key is ignored by an old caller; a new status code is not.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: AR.unauthorized }, { status: 401 });
  }

  // Fetch profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError) {
    // Every failure used to answer 404 «لم نعثر على ملفك الشخصي.», and the
    // profile page renders that string verbatim
    // (src/app/dashboard/lawyer/profile/page.tsx:253) — so an outage, a timeout
    // or any other Postgres error told a lawyer his account did not exist.
    // PGRST116 is `.single()`'s genuine zero-rows code and is the ONLY one for
    // which "not found" is true. (An RLS-excluded row is NOT a separate case: a
    // policy filters a SELECT rather than raising, so it also lands on PGRST116
    // and took — and still takes — the 404 path. That is the right answer for a
    // row this caller may not see.)
    // this repo already draws the line there at
    // src/app/api/v1/admin/library/route.ts:178 and
    // src/app/api/v1/lawyer/finance/route.ts:151.
    if (profileError.code === "PGRST116") {
      return NextResponse.json(
        { error: AR.profileNotFound },
        { status: 404 },
      );
    }
    console.error(
      "[api/v1/profile] profiles read failed:",
      profileError.message,
      profileError.code,
    );
    return NextResponse.json({ error: AR.readFailed }, { status: 500 });
  }

  // Fetch role-specific profile if applicable.
  //
  // `.maybeSingle()`, not `.single()`, and the error is now READ. Under
  // `.single()` an absent row raised PGRST116 into the very `error` this code
  // discarded, so a missing row and a failed read were the same value. Under
  // `.maybeSingle()` they separate cleanly and the output for the absent case
  // is unchanged (`data: null, error: null` → `roleProfile = null`):
  //   error != null           → the read FAILED  → roleProfileReadFailed
  //   data  == null, no error → no row, honestly → roleProfile stays null
  // The three branches stay written out rather than collapsed into one
  // `from(table)` call: only one ever runs, and a union table name changes what
  // supabase-js infers for the row type.
  let roleProfile = null;
  let roleProfileReadFailed = false;
  const roleReadFailed = (table: string, message: string, code: string) => {
    console.error(`[api/v1/profile] ${table} read failed:`, message, code);
    roleProfileReadFailed = true;
  };

  if (profile.user_type === "lawyer") {
    const { data, error } = await supabase
      .from("lawyer_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) roleReadFailed("lawyer_profiles", error.message, error.code);
    else roleProfile = data;
  } else if (profile.user_type === "provider") {
    const { data, error } = await supabase
      .from("provider_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) roleReadFailed("provider_profiles", error.message, error.code);
    else roleProfile = data;
  } else if (profile.user_type === "micro") {
    const { data, error } = await supabase
      .from("micro_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) roleReadFailed("micro_profiles", error.message, error.code);
    else roleProfile = data;
  }

  // Fetch subscription
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*, subscription_plans(*)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Always emitted, including `false`. An absent key would be
  // indistinguishable from an older deploy, and a client that reads
  // `res.roleProfileReadFailed === true` must not have to guess which it got.
  return NextResponse.json({
    profile,
    roleProfile,
    roleProfileReadFailed,
    subscription,
  });
}

/**
 * PATCH /api/v1/profile — Update current user's profile
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: AR.unauthorized }, { status: 401 });
  }

  // A body that is not a JSON object would throw on the `in` checks below and
  // surface as an English Next.js error page.
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: AR.noFields }, { status: 400 });
  }

  // profiles allowlist (+ city).
  // NOTE: onboarding_completed is self-settable, unlike user_type and
  // verification_status below. It is a progress flag, not a privilege: it
  // authorizes nothing on its own, and the onboarding gate independently
  // requires a phone number (src/lib/auth/onboardingGate.ts), so setting it
  // true without one still lands the user back in the wizard. user_type is a
  // different animal — the database itself refuses a self-change
  // (trg_lock_user_type, supabase/migrations/20260716_security_hardening.sql:123-157),
  // so it is claimed once through POST /api/v1/onboarding/account-type instead.
  const profileFields = [
    "display_name",
    "display_name_en",
    "phone",
    "avatar_url",
    "language",
    "calendar_type",
    "theme",
    "country_code",
    "city",
    "onboarding_completed",
  ];
  // lawyer_profiles allowlist (real column names from the 20260603 schema).
  // NOTE: verification_status is intentionally NOT self-editable (admin-only) —
  // self-verification would be a trust-badge bypass.
  const lawyerFields = [
    "bio_ar",
    "bio_en",
    "specialties",
    "years_experience",
    "hourly_rate",
    "license_number",
    "bar_association",
    "city",
    "marketplace_visible",
    "is_accepting_clients",
    "show_contact",
  ];
  // `city` is the one name on both lists — profiles.city and
  // lawyer_profiles.city are separate columns
  // (supabase/migrations/20260616_production_readiness_fixes.sql:15-21). What
  // decides whether this request touches lawyer_profiles at all is therefore a
  // lawyer-ONLY key, never a shared one. Before this distinction existed, a
  // body of { phone, city } from the onboarding wizard produced a non-empty
  // lawyer update and answered every non-lawyer with 403 — after the profiles
  // write had already run.
  const lawyerOnlyFields = lawyerFields.filter((f) => !profileFields.includes(f));

  if ("phone" in body) {
    const normalized = normalizeSaudiMobile(body.phone);
    if (!normalized) {
      return NextResponse.json({ error: AR.badPhone }, { status: 400 });
    }
    // Store one shape, whatever was typed.
    body.phone = normalized;
  }

  if ("onboarding_completed" in body && typeof body.onboarding_completed !== "boolean") {
    // The column is `boolean not null`
    // (supabase/migrations/20260603_phase1_001_profiles.sql:50); anything else
    // would come back as a Postgres error in English.
    return NextResponse.json({ error: AR.badOnboardingFlag }, { status: 400 });
  }

  const profileUpdates: Record<string, unknown> = {};
  for (const key of profileFields) if (key in body) profileUpdates[key] = body[key];

  const wantsLawyerUpdate = lawyerOnlyFields.some((key) => key in body);
  const lawyerUpdates: Record<string, unknown> = {};
  if (wantsLawyerUpdate) {
    for (const key of lawyerFields) if (key in body) lawyerUpdates[key] = body[key];
  }

  if (
    Object.keys(profileUpdates).length === 0 &&
    Object.keys(lawyerUpdates).length === 0
  ) {
    return NextResponse.json(
      { error: AR.noFields },
      { status: 400 },
    );
  }

  // Determine user_type to route role-profile updates (mirrors GET).
  const { data: baseProfile, error: baseErr } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("id", user.id)
    .single();
  // Same split as the GET above: a failed read is not a missing profile. This
  // message is rendered into the editor's save banner
  // (src/app/dashboard/lawyer/profile/edit/page.tsx handleSave catch), so
  // «لم نعثر على ملفك الشخصي.» over a transport error told a lawyer mid-save
  // that his account was gone.
  if (baseErr && baseErr.code !== "PGRST116") {
    console.error("[api/v1/profile] profiles read failed:", baseErr.message, baseErr.code);
    return NextResponse.json({ error: AR.readFailed }, { status: 500 });
  }
  if (baseErr || !baseProfile) {
    return NextResponse.json({ error: AR.profileNotFound }, { status: 404 });
  }

  // Refuse BEFORE writing anything, so a rejected request leaves no half-write
  // behind.
  if (wantsLawyerUpdate && baseProfile.user_type !== "lawyer") {
    return NextResponse.json(
      { error: AR.lawyerFieldsOnly },
      { status: 403 },
    );
  }

  let profile = null;
  if (Object.keys(profileUpdates).length > 0) {
    const { data, error } = await supabase
      .from("profiles")
      .update(profileUpdates)
      .eq("id", user.id)
      .select()
      .single();
    if (error) {
      console.error("[api/v1/profile] profiles update failed:", error.message);
      return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
    }
    profile = data;
  }

  let roleProfile = null;
  if (Object.keys(lawyerUpdates).length > 0) {
    const { data, error } = await supabase
      .from("lawyer_profiles")
      .update(lawyerUpdates)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) {
      console.error("[api/v1/profile] lawyer_profiles update failed:", error.message);
      return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
    }
    roleProfile = data;
  }

  return NextResponse.json({ profile, roleProfile });
}
