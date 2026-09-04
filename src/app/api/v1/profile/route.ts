import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  slugIssue,
  educationIssue,
  isCourtCode,
  isLanguageCode,
  type EducationEntry,
} from "@/lib/services/lawyerProfileFields";
import { offPlatformContactIssue } from "@/lib/services/contactSanitizer";
import { entityProfileTableFor } from "@/lib/services/profileSettingsFields";
import {
  nationalityIssue,
  officeAddressIssue,
  licenseIssuedOnIssue,
  isPlainObject,
  validateEntitySettingsPatch,
  mergeEntitySettings,
  readEntitySettings,
  validateBusinessProfilePatch,
  type EntitySettingsValue,
  type BusinessProfilePatch,
} from "@/lib/services/profileEntityFields";
// The registration form's own contract file (src/app/register/client/…) —
// reused rather than re-implemented so the CR normalization and the capacity
// allowlist stay in exactly one place. See its own header: renaming a value
// here without updating 20260826_corporate_identity_persisted.sql breaks the
// signup trigger silently.
import { normalizeCrNumber, isLegalRepCapacity } from "@/app/register/client/components/_corporateIdentity";

// ─── Arabic error copy ────────────────────────────────────────────────────────
// Every message this route can return reaches a user: the lawyer profile
// editor renders `err.message` straight into its save banner (`handleSave`'s
// catch in LawyerProfileEditPage), and the onboarding wizard renders the
// `error` field of the body. So no English and no raw Postgres text leaves
// this file — those go to the server log instead.
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
  badSlug: "قيمة الرابط غير صالحة.",
  slugTaken: "هذا الرابط مستخدم من محامٍ آخر",
  unknownCourt: "محكمة غير معروفة",
  unknownLanguage: "لغة غير معروفة",
  badHeadline: "قيمة العنوان التعريفي غير صالحة.",
  // ─── task S1 additions ────────────────────────────────────────────────
  badEntitySettingsShape: "بيانات إعدادات الكيان يجب أن تكون كائناً.",
  noEntityForType: "لا توجد بيانات كيان مرتبطة بنوع حسابك.",
  entityRowMissing: "لم نعثر على بيانات الكيان الخاصة بحسابك.",
  businessFieldsOnly: "هذه الحقول متاحة للحسابات التجارية فقط.",
} as const;

/** lawyer_profiles.headline_ar — checked in code, not just at the column (item 130). */
const MAX_HEADLINE_LENGTH = 160;

/**
 * The column `<entityProfileTableFor(userType)>` keys its own row by.
 *
 * firm_profiles / business_profiles / government_profiles / ngo_profiles
 * (supabase/migrations/20260603_phase1_002_entities.sql) use
 * `owner_user_id`; micro_profiles / provider_profiles
 * (20260603_phase1_001_profiles.sql) use `user_id` — the SAME column GET
 * already reads them by above as `roleProfile`. Every one of the six carries
 * an owner-scoped UPDATE policy ("<table>: owner can update" /
 * "<role> update own profile") using this exact column, which is what makes
 * the RLS-scoped writes below safe without a service-role client.
 */
function entityOwnerColumn(table: string): "owner_user_id" | "user_id" {
  return table === "micro_profiles" || table === "provider_profiles" ? "user_id" : "owner_user_id";
}

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
 *   • `load()` in LawyerProfileEditPage (dashboard/lawyer/profile/edit) leaves
 *     the form unpopulated — and Save disabled — for ANY null `roleProfile`,
 *     which is what stops a blank form from overwriting a real licence number.
 *     The marker does not touch that gate; it only picks which banner shows.
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

  // ─── entitySettings (+ businessProfile for corporate) — task S1 ─────────
  //
  // entityProfileTableFor(user_type) names the ONE table whose
  // metadata.settings holds this account's entitySettings. For "provider"
  // and "micro" that table is the SAME one just read above as roleProfile —
  // its `metadata` is already in hand, so no second round trip. Every other
  // mapped type (firm/corporate/government/ngo) has no roleProfile fetch
  // above and needs its own read, scoped by entityOwnerColumn() (always
  // `owner_user_id` for those four).
  let entitySettings: Record<string, unknown> = {};
  let businessProfile: Record<string, unknown> | null = null;
  const entityTable = entityProfileTableFor(profile.user_type);
  if (entityTable === "provider_profiles" || entityTable === "micro_profiles") {
    entitySettings = readEntitySettings((roleProfile as { metadata?: unknown } | null)?.metadata);
  } else if (entityTable) {
    const ownerCol = entityOwnerColumn(entityTable);
    const selectCols =
      entityTable === "business_profiles"
        ? "metadata, company_name_ar, cr_number, legal_rep_name, legal_rep_capacity"
        : "metadata";
    const { data, error } = await supabase
      .from(entityTable)
      .select(selectCols)
      .eq(ownerCol, user.id)
      .maybeSingle();
    if (error) {
      roleReadFailed(entityTable, error.message, error.code);
    } else if (data) {
      entitySettings = readEntitySettings((data as { metadata?: unknown }).metadata);
      if (entityTable === "business_profiles") {
        const row = data as {
          company_name_ar?: unknown;
          cr_number?: unknown;
          legal_rep_name?: unknown;
          legal_rep_capacity?: unknown;
        };
        businessProfile = {
          company_name_ar: row.company_name_ar ?? null,
          cr_number: row.cr_number ?? null,
          legal_rep_name: row.legal_rep_name ?? null,
          legal_rep_capacity: row.legal_rep_capacity ?? null,
        };
      }
    }
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
  //
  // `entitySettings` is always present ({} when the account type has no
  // entity table). `businessProfile` is present ONLY for corporate — every
  // other type's business_profiles reference stays null, which is what
  // keeps this addition backward-compatible for the three existing readers
  // (onboarding wizard, LawyerProfileEditPage, LawyerProfileForms) that
  // destructure only `{ profile, roleProfile }`.
  return NextResponse.json({
    profile,
    roleProfile,
    roleProfileReadFailed,
    subscription,
    entitySettings,
    ...(profile.user_type === "corporate" ? { businessProfile } : {}),
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
    // Task S1 — supabase/migrations/20260906_phase6_settings_out_of_browser.sql.
    "nationality",
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
    // Phase 7 (item 128 · 130 · 133) — contracts in lawyerProfileFields.ts /
    // contactSanitizer.ts; columns added by
    // supabase/migrations/20260907_phase7_profile_services_reviews.sql.
    "slug",
    "education",
    "courts",
    "languages",
    "headline_ar",
    // Task S1 — supabase/migrations/20260906_phase6_settings_out_of_browser.sql.
    // NOT license_expiry: that column exists but is outside this task's
    // authorized field list — ProfileTab renders it read-only rather than
    // silently dropping a value the caller thinks it sent.
    "license_issued_on",
    "office_address",
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

  // ─── Phase 7 profile fields (item 128 · 130 · 133) ───────────────────────
  // Format-validated here regardless of account type, same as phone/
  // onboarding_completed above — the lawyer-only 403 (below, once user_type is
  // known) is a separate gate from "is this value even well-formed".
  if ("slug" in body) {
    const raw = body.slug;
    if (raw === null || raw === undefined) {
      body.slug = null; // clears it
    } else if (typeof raw !== "string") {
      return NextResponse.json({ error: AR.badSlug }, { status: 400 });
    } else {
      const trimmed = raw.trim();
      if (trimmed === "") {
        body.slug = null; // clears it
      } else {
        const issue = slugIssue(trimmed);
        if (issue) return NextResponse.json({ error: issue }, { status: 400 });
        // slugIssue already refused anything not equal to its own lowercase
        // form; .toLowerCase() here is belt-and-suspenders, not a bypass.
        body.slug = trimmed.toLowerCase();
      }
    }
  }

  if ("education" in body) {
    const issue = educationIssue(body.education as EducationEntry[]);
    if (issue) return NextResponse.json({ error: issue }, { status: 400 });
  }

  if ("courts" in body) {
    const val = body.courts;
    if (!Array.isArray(val) || !val.every(isCourtCode)) {
      return NextResponse.json({ error: AR.unknownCourt }, { status: 400 });
    }
  }

  if ("languages" in body) {
    const val = body.languages;
    if (!Array.isArray(val) || !val.every(isLanguageCode)) {
      return NextResponse.json({ error: AR.unknownLanguage }, { status: 400 });
    }
  }

  if ("headline_ar" in body) {
    const raw = body.headline_ar;
    if (typeof raw !== "string") {
      return NextResponse.json({ error: AR.badHeadline }, { status: 400 });
    }
    if (raw.length > MAX_HEADLINE_LENGTH) {
      return NextResponse.json(
        { error: `العنوان التعريفي يجب ألا يتجاوز ${MAX_HEADLINE_LENGTH} حرفًا.` },
        { status: 400 },
      );
    }
    const contactIssue = offPlatformContactIssue(raw);
    if (contactIssue) return NextResponse.json({ error: contactIssue }, { status: 400 });
  }

  // bio_ar is an existing field (not new in this phase); off-platform-contact
  // checking it is the new part (item 179).
  if (typeof body.bio_ar === "string") {
    const contactIssue = offPlatformContactIssue(body.bio_ar);
    if (contactIssue) return NextResponse.json({ error: contactIssue }, { status: 400 });
  }

  // ─── Task S1 fields ───────────────────────────────────────────────────
  // Format-validated here regardless of account type, same as everything
  // above — the account-type gates (lawyer-only, entity-table-only,
  // corporate-only) run once user_type is known, further down.
  if ("nationality" in body) {
    const issue = nationalityIssue(body.nationality);
    if (issue) return NextResponse.json({ error: issue }, { status: 400 });
  }

  if ("license_issued_on" in body) {
    const issue = licenseIssuedOnIssue(body.license_issued_on);
    if (issue) return NextResponse.json({ error: issue }, { status: 400 });
  }

  if ("office_address" in body) {
    const issue = officeAddressIssue(body.office_address);
    if (issue) return NextResponse.json({ error: issue }, { status: 400 });
  }

  // `entitySettings` shallow-merges into <entity table>.metadata.settings.
  // `null` in the patch object clears (not deletes) a key — see
  // mergeEntitySettings — but the whole `entitySettings` body key itself
  // being `null`/absent/`{}` just means "nothing to merge this call", not an
  // error: ProfileTab always includes the key (possibly empty) for every
  // account type, since not every type has entitySettings-targeted fields.
  let entitySettingsPatch: Record<string, EntitySettingsValue> | null = null;
  if ("entitySettings" in body) {
    const raw = body.entitySettings;
    if (raw !== null && raw !== undefined) {
      if (!isPlainObject(raw)) {
        return NextResponse.json({ error: AR.badEntitySettingsShape }, { status: 400 });
      }
      if (Object.keys(raw).length > 0) {
        const validation = validateEntitySettingsPatch(raw);
        if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
        entitySettingsPatch = validation.patch;
      }
    }
  }

  // `businessProfile` writes the four real business_profiles columns
  // (corporate accounts only — gated below once user_type is known).
  let businessProfilePatch: BusinessProfilePatch | null = null;
  if ("businessProfile" in body) {
    const raw = body.businessProfile;
    if (raw !== null && raw !== undefined) {
      const validation = validateBusinessProfilePatch(
        raw,
        normalizeCrNumber,
        // isLegalRepCapacity's own parameter type (string | null | undefined)
        // is narrower than the (v: unknown) => boolean the pure module
        // declares — a deliberate wrapper, not a cast that hides anything:
        // isLegalRepCapacity itself starts with `typeof value === "string"`.
        (v: unknown) => isLegalRepCapacity(v as string | null | undefined),
      );
      if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
      if (Object.keys(validation.patch).length > 0) businessProfilePatch = validation.patch;
    }
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
    Object.keys(lawyerUpdates).length === 0 &&
    entitySettingsPatch === null &&
    businessProfilePatch === null
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

  if (entitySettingsPatch !== null && !entityProfileTableFor(baseProfile.user_type)) {
    return NextResponse.json({ error: AR.noEntityForType }, { status: 400 });
  }

  if (businessProfilePatch !== null && baseProfile.user_type !== "corporate") {
    return NextResponse.json({ error: AR.businessFieldsOnly }, { status: 403 });
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
      // uq_lawyer_profiles_slug (20260907_phase7_profile_services_reviews.sql)
      // — another lawyer claimed this slug between our format check and the
      // write. Gated on "slug" actually being in THIS update (not just
      // `error.code === "23505"`) so a 23505 from some other unique index on
      // lawyer_profiles doesn't get mislabeled as a slug collision. `in`, not
      // `!== undefined`: clearing the slug (null) still counts as "in play".
      if (error.code === "23505" && "slug" in lawyerUpdates) {
        return NextResponse.json({ error: AR.slugTaken }, { status: 409 });
      }
      console.error("[api/v1/profile] lawyer_profiles update failed:", error.message);
      return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
    }
    roleProfile = data;
  }

  // ─── entitySettings — read-merge-write, same pattern as
  // PATCH /api/v1/settings/preferences (mergePreferences there,
  // mergeEntitySettings here). Not atomic with the writes above, same as
  // profiles/lawyer_profiles are not atomic with each other already.
  let entitySettings: Record<string, unknown> | null = null;
  if (entitySettingsPatch !== null) {
    const entityTable = entityProfileTableFor(baseProfile.user_type)!; // guarded above
    const ownerCol = entityOwnerColumn(entityTable);
    const { data: entityRow, error: entityReadErr } = await supabase
      .from(entityTable)
      .select("metadata")
      .eq(ownerCol, user.id)
      .maybeSingle();
    if (entityReadErr) {
      console.error(`[api/v1/profile] ${entityTable} read failed:`, entityReadErr.message, entityReadErr.code);
      return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
    }
    if (!entityRow) {
      // The signup trigger (handle_new_user) creates this row for every
      // mapped type; a missing row here means that trigger did not run for
      // this account, not that the caller did anything wrong.
      console.error(`[api/v1/profile] ${entityTable} row missing for user`, user.id);
      return NextResponse.json({ error: AR.entityRowMissing }, { status: 404 });
    }
    const mergedMetadata = mergeEntitySettings(
      (entityRow as { metadata?: unknown }).metadata,
      entitySettingsPatch,
    );
    const { data: updatedEntity, error: entityWriteErr } = await supabase
      .from(entityTable)
      .update({ metadata: mergedMetadata })
      .eq(ownerCol, user.id)
      .select("metadata")
      .single();
    if (entityWriteErr) {
      console.error(`[api/v1/profile] ${entityTable} update failed:`, entityWriteErr.message);
      return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
    }
    entitySettings = readEntitySettings((updatedEntity as { metadata?: unknown } | null)?.metadata);
  }

  // ─── businessProfile — direct column update, corporate only ─────────────
  let businessProfile: Record<string, unknown> | null = null;
  if (businessProfilePatch !== null) {
    const { data, error } = await supabase
      .from("business_profiles")
      .update(businessProfilePatch)
      .eq("owner_user_id", user.id)
      .select("company_name_ar, cr_number, legal_rep_name, legal_rep_capacity")
      .single();
    if (error) {
      console.error("[api/v1/profile] business_profiles update failed:", error.message);
      return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
    }
    businessProfile = data;
  }

  return NextResponse.json({ profile, roleProfile, entitySettings, businessProfile });
}
