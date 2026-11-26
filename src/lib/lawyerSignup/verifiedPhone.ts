/**
 * verifiedPhone.ts — R6 (batch l11-sec): one VERIFIED lawyer / provider account
 * per mobile number (profiles.phone, E.164).
 *
 * The database holds the rule for every writer (20261201_10: the trigger
 * trg_verified_phone_unique on lawyer_profiles / provider_profiles / profiles
 * refuses with errcode 23505, constraint verified_phone_unique, message
 * «verified_phone_taken…»). This file is the same check in the app — so the
 * admin approval answers a clear Arabic refusal before it writes, and holds
 * before the SQL runs — and the reader of the database's refusal.
 *
 * Unverified accounts may share a number: a sign-up never blocks a number, as
 * with the per-licence rule (20261122_40).
 *
 * Type-only imports: `node --test` loads it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const VERIFIED_PHONE_APPROVAL_REFUSAL_AR =
  "لا يمكن الاعتماد: رقم الجوال نفسه مسجّل لحساب آخر موثّق. راجع الحسابين قبل الاعتماد.";

/**
 * Owner answer ٢٣٥ (batch l18): the user-facing refusal of a taken number is
 * one neutral sentence that says nothing about the other account — the same
 * words as src/lib/phoneOtp/confirmedPhone.ts PHONE_UNUSABLE_AR. (The admin
 * approval text above stays: an admin may know.)
 */
export const VERIFIED_PHONE_PROFILE_REFUSAL_AR = "تعذّر استعمال هذا الرقم، استعمل رقمًا آخر أو تواصل معنا";

/** The database trigger's refusal (20261201_10). */
export function isVerifiedPhoneDbError(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "23505" && typeof error.message === "string" && error.message.startsWith("verified_phone_taken");
}

type Res = { data: unknown; error: { code?: string; message?: string } | null };

/**
 * Another account that is already a VERIFIED lawyer or provider holds this
 * user's mobile. Service client. true / false; null when it could not be read
 * (the caller decides — the approval refuses rather than guesses).
 */
export async function verifiedPhoneTakenFor(admin: SupabaseClient, userId: string): Promise<boolean | null> {
  try {
    const own = (await admin.from("profiles").select("phone").eq("id", userId).maybeSingle()) as Res;
    if (own.error) return null;
    const phone = (own.data as { phone?: unknown } | null)?.phone;
    if (typeof phone !== "string" || phone.trim() === "") return false;

    const others = (await admin.from("profiles").select("id").eq("phone", phone).neq("id", userId).limit(50)) as Res;
    if (others.error) return null;
    const ids = ((others.data ?? []) as Array<{ id?: unknown }>)
      .map((r) => r.id)
      .filter((id): id is string => typeof id === "string");
    if (ids.length === 0) return false;

    const [lawyers, providers] = (await Promise.all([
      admin.from("lawyer_profiles").select("user_id").in("user_id", ids).eq("verification_status", "verified").limit(1),
      admin.from("provider_profiles").select("user_id").in("user_id", ids).eq("verification_status", "verified").limit(1),
    ])) as Res[];
    if (lawyers.error || providers.error) return null;
    return (Array.isArray(lawyers.data) && lawyers.data.length > 0) || (Array.isArray(providers.data) && providers.data.length > 0);
  } catch {
    return null;
  }
}
