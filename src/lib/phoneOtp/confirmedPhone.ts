/**
 * confirmedPhone.ts — owner answer ٢٣٥ §2 (27 Nov 2026, batch l18-answers):
 * «رقم الجوال المؤكَّد يكون لحساب واحد فقط».
 *
 * A mobile CONFIRMED by a WhatsApp code (profiles.phone with
 * profiles.phone_verified_at set) belongs to one account. The app refuses a
 * number confirmed on another account BEFORE it writes or sends anything
 * (phone-otp start, including «تغيير الرقم»; phone-otp verify; profile
 * PATCH), and the database holds the same rule for every writer
 * (20261208_50: trg_phone_verified_unique refuses a second confirmation with
 * errcode 23505, message «confirmed_phone_taken…»).
 *
 * One neutral answer everywhere — the owner's words — whatever the other
 * account is (confirmed lawyer, client, staff): it says neither that the
 * number has an account nor what kind.
 *
 * Type-only imports: `node --test` loads it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const PHONE_UNUSABLE_AR = "تعذّر استعمال هذا الرقم، استعمل رقمًا آخر أو تواصل معنا";

/**
 * The database's refusal (20261208_50): the guard's own message, or — once the
 * partial unique index exists — a race the guard did not see, refused by the
 * index profiles_confirmed_phone_unique.
 */
export function isConfirmedPhoneDbError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (error?.code !== "23505" || typeof error.message !== "string") return false;
  return error.message.startsWith("confirmed_phone_taken") || error.message.includes("profiles_confirmed_phone_unique");
}

/**
 * The spellings one number may be stored under — the same three the sign-in
 * resolver (20261208_20) and the guard (20261208_50) compare: +9665…, 9665…,
 * 05…. `e164` is normalizeSaudiMobile's output.
 */
export function confirmedPhoneSpellings(e164: string): string[] {
  if (!/^\+9665[0-9]{8}$/.test(e164)) return [e164];
  return [e164, e164.slice(1), `0${e164.slice(4)}`];
}

type Res = { data: unknown; error: { code?: string; message?: string } | null };

/**
 * Another account has this mobile confirmed. Service client (a session cannot
 * read other profiles). true / false; null when it could not be read — the
 * caller then goes on, and the database guard still refuses a second
 * confirmation.
 */
export async function confirmedPhoneTakenElsewhere(
  svc: Pick<SupabaseClient, "from">,
  userId: string,
  e164: string,
): Promise<boolean | null> {
  try {
    const res = (await svc
      .from("profiles")
      .select("id")
      .in("phone", confirmedPhoneSpellings(e164))
      .not("phone_verified_at", "is", null)
      .neq("id", userId)
      .limit(1)) as Res;
    if (res.error) return null;
    return Array.isArray(res.data) && res.data.length > 0;
  } catch {
    return null;
  }
}
