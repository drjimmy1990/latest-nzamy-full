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
 * Batch l19 (owner decision ٢٣٥, his exact words): on the sign-up and the
 * mobile confirmation / change screens the answer names the reason, Gmail
 * style, with three ways out — sign in with it, reset the password, contact
 * us (src/components/auth/PhoneTakenNotice.tsx draws the links). The same
 * sentence whatever the other account is (lawyer, client, staff): it never
 * says what kind of account. /login and /forgot-password never use it; their
 * answers stay neutral.
 *
 * Type-only imports: `node --test` loads it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const PHONE_TAKEN_AR =
  "هذا الرقم مستخدم من قبل في حساب آخر. يمكنك تسجيل الدخول به بدلاً من ذلك، أو استعادة كلمة المرور، أو التواصل معنا إذا واجهتك مشكلة.";
export const PHONE_TAKEN_EN =
  "This number is already used on another account. You can sign in with it instead, reset the password, or contact us if you run into a problem.";
/** The `reason` / `code` the APIs answer with this sentence; the screens key the links on it. */
export const PHONE_TAKEN_CODE = "phone_taken";
/**
 * The sentence as a screen receives it from a helper that keeps only the
 * error text (apiMutate): exactly PHONE_TAKEN_AR.
 */
export function isPhoneTakenText(text: unknown): boolean {
  return text === PHONE_TAKEN_AR;
}
/** The three ways out, in the owner's order. */
export const PHONE_TAKEN_LINKS = Object.freeze([
  Object.freeze({ href: "/login", ar: "تسجيل الدخول", en: "Sign in", signOutFirst: true }),
  Object.freeze({ href: "/forgot-password", ar: "استعادة كلمة المرور", en: "Reset the password", signOutFirst: true }),
  Object.freeze({ href: "/contact", ar: "تواصل معنا", en: "Contact us", signOutFirst: false }),
]);

/**
 * l18 review: how many number CHANGES one account may try on PATCH
 * /api/v1/profile — the same bound as phone-otp/start (8 per 10 minutes per
 * user), checked BEFORE the confirmed-elsewhere question is asked, so the
 * route cannot be used to sweep numbers.
 */
export const PROFILE_PHONE_CHANGE_LIMIT = Object.freeze({ limit: 8, windowMs: 10 * 60_000 });

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
