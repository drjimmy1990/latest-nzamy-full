/**
 * The onboarding gate — one predicate, so the proxy and the OAuth callback
 * cannot disagree about who has to finish the wizard.
 *
 * It is deliberately pure: it reads nothing, awaits nothing, and holds no
 * Supabase client. The caller reads `profiles` (the single source of truth for
 * `user_type`, `phone` and `onboarding_completed`) and hands the three answers
 * in. That is what makes every branch below testable without a database.
 *
 * ── Why this module exists ────────────────────────────────────────────────
 * Nothing calls it yet. Task 3 of the plan replaces the block at
 * src/proxy.ts:133-145 with a call to it, and Task 6 does the same in the
 * OAuth callback. That block carries two defects, both pinned by tests here
 * so they cannot come back:
 *
 *   G1 — the variable there is called `skipOnboarding` (:135) but is assigned
 *        `!['lawyer','firm'].includes(userType)`, i.e. true for everyone
 *        EXCEPT lawyers and firms, and the guard at :137 then requires
 *        `!skipOnboarding`. Onboarding is forced on exactly the two roles the
 *        comment at :133 says to skip, and skipped for everyone else.
 *
 *   G2 — the same guard requires `onboarding_completed === false` strictly
 *        (:140). A user who signed in with Google has no such key in their
 *        metadata, so the comparison is `undefined === false` and the gate
 *        never fires for them at all.
 *
 * ── Why these three types are exempt ──────────────────────────────────────
 *   lawyer, firm — they register through /register/provider, which collects
 *     the licence number, years of experience and specialties this wizard has
 *     no fields for (src/app/register/provider/page.tsx:54,243,247). Sending
 *     them here would ask them to redo a longer form with a shorter one.
 *   admin — the onboarding picker has no admin option at all. An admin who
 *     completed the wizard would write whatever the picker offers over their
 *     own `user_type`, downgrading themselves. `admin` is a real value of the
 *     profiles.user_type CHECK constraint
 *     (supabase/migrations/20260603_phase1_001_profiles.sql:32-35) and one of
 *     the 16 live accounts holds it, so this is guarded here in code rather
 *     than left to the absence of a UI control.
 *
 * The set is exactly these three, and it is the only list this module owns.
 * `provider` is NOT exempt: it is a DB type with no picker option, and what a
 * Google user should do about that is still open. (The stale comment at
 * src/proxy.ts:133 claims providers are skipped too; the list it describes,
 * at :135, never mentioned them. Registration at /register/provider does
 * assign `provider` alongside `lawyer` and `firm` — see
 * src/app/register/provider/page.tsx:214.)
 *
 * ── Why a phone can send back someone who already "completed" onboarding ──
 * `profiles.phone` is the only phone number the outbound notification payload
 * carries: the dispatch path reads it straight off the profiles row
 * (src/app/api/v1/service-requests/[id]/route.ts:334-338) and copies it into
 * the webhook recipient block for outbound channels such as WhatsApp
 * (src/lib/n8n/payload.ts:214,218), omitting the field entirely when it is
 * absent. An OAuth provider never supplies a phone, so a Google user who
 * finished an older wizard can hold `onboarding_completed = true` and still
 * have no number anyone can reach them on. That is why completion alone is
 * not enough.
 *
 * NOTE: this module decides only WHO must onboard. It does not redirect, and
 * it does not validate a phone number's format — the caller owns the redirect
 * and the wizard owns the format.
 */

/**
 * Account types that never see the onboarding wizard. See the block comment
 * above for why each one is here; do not add to this set without the same.
 */
const ONBOARDING_EXEMPT_USER_TYPES: ReadonlySet<string> = new Set([
  "lawyer",
  "firm",
  "admin",
]);

export interface OnboardingGateInput {
  /**
   * `profiles.user_type`. Undefined or null when the profiles row is missing.
   * Absent counts as unfinished — see below — so a user whose type nobody can
   * read is never waved past the wizard.
   */
  userType?: string | null;
  /**
   * `profiles.onboarding_completed`. Typed `unknown`, not `boolean`, so that
   * an absent value — the Google case, and a missing profiles row — is
   * representable instead of being smuggled in as a cast. Only the boolean
   * `true` counts as completed.
   */
  onboardingCompleted?: unknown;
  /** Whether `profiles.phone` holds a non-empty value. The caller decides
   *  what "non-empty" means; this predicate only reads the boolean. */
  hasPhone: boolean;
}

/**
 * True when this user must be sent to /onboarding before anything else.
 *
 * An exempt type short-circuits: a lawyer with no phone and no completion
 * flag is still not redirected.
 */
export function needsOnboarding(input: OnboardingGateInput): boolean {
  const userType = input.userType ?? "";
  if (ONBOARDING_EXEMPT_USER_TYPES.has(userType)) return false;

  // No type at all — a missing profiles row, or a caller with nothing to
  // pass. Choosing a type is the first thing the wizard does, so an account
  // without one has not finished it, whatever the other two inputs claim.
  // An unrecognised NON-empty type is not treated specially: validating a
  // value against the DB vocabulary belongs to toDbUserType, and repeating
  // that list here is how two copies of it would drift apart.
  if (userType === "") return true;

  // Strictly `true`. Anything else — undefined (G2: the Google case),
  // null, false, or a truthy non-boolean — means not completed. Wrongly
  // gating a finished user costs one visit to the wizard; wrongly waving an
  // unfinished one through leaves them without a phone permanently.
  if (input.onboardingCompleted !== true) return true;

  // Completed, but unreachable: still needs the wizard, for the phone alone.
  return !input.hasPhone;
}
