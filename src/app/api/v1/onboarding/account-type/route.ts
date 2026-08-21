import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canClaimAccountType,
  sectorRowValuesFor,
  type AccountTypeClaimRefusal,
  type ClaimableDbUserType,
} from "@/lib/auth/accountTypeClaim";

/**
 * POST /api/v1/onboarding/account-type — the one-time account-type claim.
 *
 * Body:     { "pickerId": "<one of the onboarding picker ids>" }
 * 200:      { "ok": true, "userType": "<the DB value written>" }
 * 400/401/403/500: { "error": "<Arabic>" }
 *
 * ── Why this endpoint has to exist ────────────────────────────────────────
 * `trg_lock_user_type` (supabase/migrations/20260716_security_hardening.sql:123-156)
 * is a BEFORE UPDATE trigger on `public.profiles` that raises
 * `'Permission denied: user_type cannot be self-modified'` (ERRCODE 42501)
 * whenever a non-admin session changes its own `user_type` (:137-143). It is a
 * deliberate P0 fix and it is correct. Service-role callers are exempt
 * (`auth.uid() IS NULL`, :132-134).
 *
 * So the onboarding wizard cannot write `user_type` itself. It writes the
 * phone through `PATCH /api/v1/profile` — which does accept `phone` — and asks
 * this route for the type. The write here is made with the service-role
 * client, which bypasses RLS; that is what makes every guard below load-bearing.
 *
 * ── Why this is parity, not new privilege — and how that was verified ─────
 * An email user ALREADY self-selects `lawyer`, `firm` or `provider` at signup:
 * `src/app/register/provider/page.tsx` computes the type from the applicant's
 * own choice in step 1 and passes it as `options.data.user_type` to
 * `supabase.auth.signUp`, and `public.handle_new_user` honours it verbatim
 * after checking it against a whitelist that excludes only `admin`
 * (…20260716:24-35). Nobody approves anything in between. A Google user gets
 * no such moment, which is the whole defect: they land as `individual` and
 * have no way to say otherwise. This route gives them exactly the same thing
 * an email user already has — in one respect slightly less, since the trigger
 * takes a firm or company name from signup metadata and a claim can only write
 * the same Arabic placeholder the trigger falls back to. Never more.
 *
 * The claim below was checked against the surfaces that could have made it an
 * escalation instead. Every one of them gates on verification, not on type:
 *
 *   - the public lawyer directory requires
 *     `lawyer_profiles.verification_status = 'verified'` on top of
 *     `user_type = 'lawyer'` (src/app/api/v1/lawyers/route.ts:34-35);
 *   - the marketplace's browse rule is RLS on `service_requests` and requires
 *     a `lawyer_profiles` row with `verification_status = 'verified'`
 *     (supabase/migrations/20260815_marketplace_excludes_ai_workspace.sql:46-49);
 *   - no RLS policy anywhere in supabase/migrations/*.sql grants anything on
 *     `profiles.user_type = 'lawyer'` alone — grep returns only the signup
 *     trigger's own branches;
 *   - all nine `assertRole(["lawyer", "firm"])` call sites
 *     (src/app/api/v1/lawyer/**) read through the caller's RLS-scoped client
 *     and are scoped to the caller's own id — `assigned_to`, `user_id`,
 *     `lawyer_user_id`, `actor_id`, `actor_user_id`. The one query without an
 *     explicit filter, the revenue sum at
 *     src/app/api/v1/lawyer/dashboard/summary/route.ts:61-66, is covered by
 *     the `participants read payments` policy
 *     (supabase/migrations/20260518_client_workflow_backend_ready.sql:181-189).
 *     A newly typed lawyer therefore sees their own empty dashboard and
 *     nothing else;
 *   - `verification_status` is not in the self-editable allowlist of
 *     `PATCH /api/v1/profile`, deliberately (see the note above `lawyerFields`
 *     in src/app/api/v1/profile/route.ts) — and this route does not set it
 *     either. `lawyer_profiles.verification_status` defaults to `'pending'`
 *     and `marketplace_visible` to `false`
 *     (supabase/migrations/20260603_phase1_001_profiles.sql:110-111 and :106).
 *
 * ── This is a one-time claim, not a role-switch API ───────────────────────
 * The eligibility rule lives in `src/lib/auth/accountTypeClaim.ts`, where each
 * branch is unit-tested. It refuses anyone whose `user_type` is not still the
 * untouched `individual` default, and anyone who has already finished
 * onboarding. Changing an established account's type remains an admin action.
 *
 * ── Inert until Google is configured ──────────────────────────────────────
 * Nothing about Google sign-in works until the owner finishes the Google Cloud
 * and Supabase console setup. This route is reachable by any signed-in user
 * today — an email user in the wizard included — but the defect it repairs is
 * only visible once OAuth is switched on.
 */

/**
 * Every user-facing string this route can emit. Arabic, because every error a
 * user can see in this product is Arabic — including the ones only a
 * misbehaving client would ever trigger.
 */
const AR = {
  badBody: "بيانات غير صالحة.",
  unauthorized: "غير مصرح — يرجى تسجيل الدخول.",
  profileReadFailed: "تعذّر قراءة بيانات حسابك. يرجى المحاولة مرة أخرى.",
  sectorFailed: "تعذّر تجهيز ملف حسابك. لم يتم تغيير نوع الحساب — يرجى المحاولة مرة أخرى.",
  writeFailed: "تعذّر حفظ نوع الحساب. يرجى المحاولة مرة أخرى.",
  unexpected: "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",
} as const;

/**
 * One Arabic sentence per refusal reason. Five different refusals behind one
 * shared "غير مسموح" would tell the user nothing about what to do next, and
 * would tell whoever reads the logs nothing about which guard fired.
 */
const AR_REFUSAL: Record<AccountTypeClaimRefusal, string> = {
  invalid_picker_id: "نوع الحساب المُرسل غير معروف. يرجى اختيار نوع من الخيارات المتاحة.",
  not_assignable: "لا يمكن اختيار هذا النوع من الحسابات.",
  // Deliberately does NOT say "sign out and sign in again": the profiles row
  // is created by handle_new_user on the auth.users INSERT
  // (supabase/migrations/20260716_security_hardening.sql:19,38-45), and
  // re-authenticating never re-runs it. Nothing the user can do restores a
  // missing row, so the message says who can.
  profile_missing: "تعذّر العثور على ملفك الشخصي، ولا يمكن إكمال هذه الخطوة. يرجى التواصل مع الدعم.",
  type_already_set: "نوع حسابك محدد مسبقًا ولا يمكن تغييره من هنا. للتغيير، يرجى التواصل مع الدعم.",
  onboarding_already_completed:
    "لقد أكملت تهيئة حسابك مسبقًا، ولا يمكن تغيير نوع الحساب بعدها. للتغيير، يرجى التواصل مع الدعم.",
};

const LOG = "[onboarding/account-type POST]";

type SectorOutcome =
  | { ok: true; table: string | null; created: boolean }
  | { ok: false; table: string; detail: string };

/**
 * Creates the role-specific row that `public.handle_new_user` would have
 * created had this user picked their type at signup (…20260716:48-101).
 *
 * The trigger runs ONLY on the `auth.users` insert. A Google user is inserted
 * as `individual`, so claiming `lawyer` afterwards leaves no `lawyer_profiles`
 * row — and the verification flow, the settings profession tab and the
 * `roleProfile` branch of `GET /api/v1/profile` (:96-102) all have nothing to
 * read. Without this step a Google lawyer is not "signed up", they are stuck.
 *
 * Idempotency differs by table, and not by choice:
 *   - `lawyer_profiles` and `micro_profiles` key on `user_id`, which is their
 *     PRIMARY KEY, so an upsert that ignores duplicates is race-free.
 *   - `firm_profiles`, `business_profiles`, `government_profiles` and
 *     `ngo_profiles` have `id uuid primary key default gen_random_uuid()` and
 *     `owner_user_id` is only NOT NULL and indexed, never unique
 *     (supabase/migrations/20260603_phase1_002_entities.sql:36-37, 219-220,
 *     398-399, 568-569). The trigger's bare `ON CONFLICT DO NOTHING` on those
 *     four has no constraint to conflict against and can never fire; inserting
 *     twice makes two rows. This function reads first instead. That closes the
 *     realistic case (a retried claim) but not a true concurrent double-POST;
 *     a UNIQUE index on `owner_user_id` is the durable fix and needs its own
 *     migration, which is not part of this change.
 */
async function provisionSectorRow(
  service: SupabaseClient,
  userType: ClaimableDbUserType,
  userId: string,
): Promise<SectorOutcome> {
  const spec = sectorRowValuesFor(userType, userId);
  // `individual` has no sector table and the trigger has no branch for one.
  if (spec === null) return { ok: true, table: null, created: false };

  if (spec.ownerColumnIsUnique) {
    const { data, error } = await service
      .from(spec.table)
      .upsert(spec.row, { onConflict: spec.ownerColumn, ignoreDuplicates: true })
      .select(spec.ownerColumn);
    if (error) {
      return { ok: false, table: spec.table, detail: `${error.code ?? "?"} ${error.message}` };
    }
    // With `ignoreDuplicates`, PostgREST returns the rows it actually
    // inserted — so an empty array means the row was already there.
    return { ok: true, table: spec.table, created: (data?.length ?? 0) > 0 };
  }

  const { data: existing, error: readError } = await service
    .from(spec.table)
    .select("id")
    .eq(spec.ownerColumn, userId)
    .limit(1);
  if (readError) {
    return { ok: false, table: spec.table, detail: `${readError.code ?? "?"} ${readError.message}` };
  }
  if ((existing?.length ?? 0) > 0) {
    return { ok: true, table: spec.table, created: false };
  }

  const { error: insertError } = await service.from(spec.table).insert(spec.row);
  if (insertError) {
    return { ok: false, table: spec.table, detail: `${insertError.code ?? "?"} ${insertError.message}` };
  }
  return { ok: true, table: spec.table, created: true };
}

export async function POST(request: NextRequest) {
  try {
    // ── The body ─────────────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: AR.badBody }, { status: 400 });
    }
    const pickerId =
      body !== null && typeof body === "object" && "pickerId" in body
        ? (body as { pickerId: unknown }).pickerId
        : undefined;
    if (typeof pickerId !== "string") {
      // A body that is not shaped like a request at all is malformed (400),
      // not a refused claim (403). A well-formed body naming a type that does
      // not exist IS a refused claim and is handled below.
      return NextResponse.json({ error: AR.badBody }, { status: 400 });
    }

    // ── Who is asking ────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: AR.unauthorized }, { status: 401 });
    }

    // Read the caller's own profile through the RLS-scoped client, never the
    // service client, and keyed on the session's user id — no id from the body
    // is read anywhere in this route.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_type, onboarding_completed")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) {
      console.error(
        `${LOG} profile read failed for ${user.id}:`,
        profileError.message, profileError.details, profileError.hint, profileError.code,
      );
      return NextResponse.json({ error: AR.profileReadFailed }, { status: 500 });
    }

    // ── May they? ────────────────────────────────────────────────────────────
    const decision = canClaimAccountType({
      requestedPickerId: pickerId,
      currentType: profile?.user_type as string | null | undefined,
      onboardingCompleted: profile?.onboarding_completed,
    });
    if (!decision.ok) {
      // Every refusal is logged: this is a privileged write, and a burst of
      // refusals is the shape a probe would have. `pickerId` is echoed back
      // truncated because it is a caller-supplied string of any length.
      console.error(
        `${LOG} refused ${user.id}: ${decision.reason} (pickerId=${JSON.stringify(pickerId.slice(0, 40))})`,
      );
      return NextResponse.json({ error: AR_REFUSAL[decision.reason] }, { status: 403 });
    }

    const service = await createServiceClient();

    // ── The sector row FIRST, the type SECOND ────────────────────────────────
    // PostgREST gives no transaction across two statements, so the order is
    // the only safety there is, and this order is the safe one.
    //
    // Type first would be the trap: `needsOnboarding` exempts `lawyer` and
    // `firm` unconditionally (src/lib/auth/onboardingGate.ts), so a user whose
    // type write landed and whose provisioning then failed would be a lawyer
    // with no `lawyer_profiles` row, exempt from the wizard that would have
    // sent them back, and refused a retry here because their type is no longer
    // `individual`. Permanently stuck, with no self-service way out.
    //
    // This order fails safe instead: the worst case is a sector row belonging
    // to someone still typed `individual`, which nothing reads — every
    // consumer checks `user_type` first (GET /api/v1/profile:96) or joins with
    // `user_type = 'lawyer'` AND `verification_status = 'verified'`
    // (src/app/api/v1/lawyers/route.ts:34-35). The retry then finds that row
    // and reuses it.
    const sector = await provisionSectorRow(service, decision.userType, user.id);
    if (!sector.ok) {
      console.error(
        `${LOG} sector provisioning failed for ${user.id} (${decision.userType} → ${sector.table}): ${sector.detail}`,
      );
      return NextResponse.json({ error: AR.sectorFailed }, { status: 500 });
    }

    // ── The privileged write ─────────────────────────────────────────────────
    // The service client bypasses RLS, so ownership goes in the query itself,
    // the same way the attachment binding in
    // src/app/api/v1/service-requests/route.ts does it:
    //   - `.eq("id", user.id)`         — the session's id, never the body's.
    //   - `.eq("user_type", "individual")` — a compare-and-swap. Eligibility
    //     was read a few milliseconds ago through a different client; this
    //     makes the precondition part of the write, so two claims racing each
    //     other cannot both succeed and a claim cannot overwrite a type that
    //     changed in between.
    const { data: updated, error: updateError } = await service
      .from("profiles")
      .update({ user_type: decision.userType })
      .eq("id", user.id)
      .eq("user_type", "individual")
      .select("id, user_type");

    if (updateError) {
      console.error(
        `${LOG} user_type write failed for ${user.id} → ${decision.userType}:`,
        updateError.message, updateError.details, updateError.hint, updateError.code,
      );
      return NextResponse.json({ error: AR.writeFailed }, { status: 500 });
    }

    if ((updated?.length ?? 0) !== 1) {
      // Zero rows means the compare-and-swap found nothing to update: the row
      // stopped being `individual` between the read and the write. Treated as
      // the refusal it is, not as a success.
      console.error(
        `${LOG} compare-and-swap matched ${updated?.length ?? 0} rows for ${user.id}; type was changed concurrently`,
      );
      return NextResponse.json({ error: AR_REFUSAL.type_already_set }, { status: 403 });
    }

    // ── Audit ────────────────────────────────────────────────────────────────
    // `admin_audit_events` is this codebase's structured audit surface: the
    // same table the verification decisions write to
    // (src/app/api/v1/admin/verifications/[id]/route.ts:143-152) and the one
    // `GET /api/v1/admin/audit-log` reads. Best-effort — a privileged write
    // that already succeeded must not be reported as failed because its trace
    // did not land — but never silent: a swallowed audit failure is an
    // invisible one.
    try {
      const { error: auditError } = await service.from("admin_audit_events").insert({
        actor_id: user.id,
        actor_type: "user",
        action: "account_type_claimed",
        target_type: "profile",
        target_id: user.id,
        // Read back rather than hardcoded "individual", even though the
        // compare-and-swap above proves it was exactly that.
        before_state: { user_type: profile?.user_type ?? null },
        after_state: { user_type: decision.userType },
        metadata: {
          source: "onboarding",
          picker_id: pickerId,
          sector_table: sector.table,
          sector_row_created: sector.created,
        },
      });
      if (auditError) {
        console.error(
          `${LOG} audit write failed for ${user.id} → ${decision.userType}:`,
          auditError.message, auditError.details, auditError.hint, auditError.code,
        );
      }
    } catch (auditErr) {
      console.error(`${LOG} audit write threw for ${user.id}:`, auditErr);
    }

    // `onboarding_completed` is deliberately NOT written here. It is in the
    // self-editable allowlist of `PATCH /api/v1/profile`, which is where the
    // wizard sets it alongside the phone.
    return NextResponse.json({ ok: true, userType: decision.userType });
  } catch (err) {
    console.error(`${LOG} Unexpected error:`, err);
    return NextResponse.json({ error: AR.unexpected }, { status: 500 });
  }
}
