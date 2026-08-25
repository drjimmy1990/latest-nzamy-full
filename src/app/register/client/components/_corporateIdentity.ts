/**
 * _corporateIdentity.ts — the form→trigger contract for a corporate signup.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `public.handle_new_user()`'s corporate branch reads
 * `raw_user_meta_data->>'company_name'` and falls back to the literal
 * «شركة جديدة» (supabase/migrations/20260821_fix_provider_signup_sub_role.sql,
 * corporate branch — carried forward unchanged from
 * 20260716_security_hardening.sql:67-74).
 *
 * `/register/client` never sent that key. It sent `full_name` / `display_name`
 * (page.tsx) — so EVERY corporate row in production reads «شركة جديدة», and the
 * CR number the form collects was written into `raw_user_meta_data` under
 * `cr_number` and then read by nobody.
 *
 * `corporateSignupMetadata()` is the single place that decides which keys go
 * into `supabase.auth.signUp({ options: { data } })`. It is a pure function so
 * the key names — the load-bearing half of the contract — are provable by test
 * rather than by reading the page component. If you rename a key here you MUST
 * rename it in `supabase/migrations/20260826_corporate_identity_persisted.sql`
 * too; nothing else connects the two.
 *
 * Owner ruling §3ج (26 Aug): persist the real trading name, the CR number, and
 * the legal representative's name and capacity.
 */

// ── Legal representative capacity ───────────────────────────────────────────

/**
 * The capacities a corporate signup may declare for its legal representative.
 *
 * These `value`s are the ONLY strings the database accepts: the column carries
 * `check (legal_rep_capacity is null or legal_rep_capacity in (…))` and the
 * signup trigger clamps anything outside this list back to NULL rather than
 * letting it reach the constraint. A CHECK violation inside that trigger would
 * abort the whole `auth.users` insert — the exact failure mode
 * 20260821_fix_provider_signup_sub_role.sql exists to repair. Adding an option
 * here therefore requires a migration; it is not a UI-only change.
 *
 * The Arabic wording follows the platform's existing term for the role,
 * «الممثل النظامي» (src/app/settings/components/tabs/EntitySettingsTab.tsx:56).
 */
export const LEGAL_REP_CAPACITIES = [
  { value: "owner", ar: "المالك", en: "Owner" },
  { value: "partner", ar: "شريك", en: "Partner" },
  { value: "manager", ar: "المدير", en: "Manager" },
  { value: "authorized_signatory", ar: "المفوّض بالتوقيع", en: "Authorized signatory" },
  { value: "legal_counsel", ar: "المستشار القانوني", en: "Legal counsel" },
  { value: "other", ar: "صفة أخرى", en: "Other capacity" },
] as const;

export type LegalRepCapacity = (typeof LEGAL_REP_CAPACITIES)[number]["value"];

const CAPACITY_VALUES: readonly string[] = LEGAL_REP_CAPACITIES.map((c) => c.value);

/** True only for a value the database column will actually accept. */
export function isLegalRepCapacity(value: string | undefined | null): value is LegalRepCapacity {
  return typeof value === "string" && CAPACITY_VALUES.includes(value);
}

// ── Commercial registration number ──────────────────────────────────────────

/**
 * Arabic-Indic (٠-٩) and Eastern-Arabic/Persian (۰-۹) digits map to ASCII.
 *
 * An RTL keyboard produces these, and a CR stored as «١٠١٠١٢٣٤٥٦» would never
 * match a search for "1010123456". The registration number is an identifier,
 * not display text, so it is normalized on the way in.
 */
function toAsciiDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660);
    else if (code >= 0x06f0 && code <= 0x06f9) out += String(code - 0x06f0);
    else out += ch;
  }
  return out;
}

/**
 * The CR exactly as it should be stored: ASCII digits, no separators, no
 * surrounding whitespace.
 *
 * Deliberately NOT length-validated — see `crNumberHint`. Anything the user
 * typed that is not a digit is dropped, so a pasted "1010-123456" or
 * "CR 1010123456" still yields a usable number instead of a rejection.
 */
export function normalizeCrNumber(raw: string | undefined | null): string {
  if (!raw) return "";
  return toAsciiDigits(String(raw)).replace(/\D/g, "");
}

/**
 * A SOFT hint about CR shape — never a gate.
 *
 * A Saudi commercial registration is 10 digits. But step 2's country selector
 * offers AE and others (Steps.tsx), and a foreign company's registration
 * number has no such shape. Enforcing 10 digits for everyone would dead-end a
 * legitimate non-Saudi registrant at «التالي» with nothing on screen
 * explaining why, so the length rule is advisory and applies only when the
 * selected country is SA.
 *
 * Returns null when there is nothing useful to say.
 */
export function crNumberHint(
  raw: string | undefined | null,
  country: string | undefined | null,
  isAr: boolean,
): string | null {
  const cr = normalizeCrNumber(raw);
  if (cr.length === 0) return null;
  if ((country || "SA") !== "SA") return null;
  if (cr.length === 10) return null;
  return isAr
    ? "رقم السجل التجاري السعودي يتكوّن عادةً من ١٠ أرقام — تأكّد من الرقم قبل المتابعة."
    : "A Saudi commercial registration is normally 10 digits — please double-check.";
}

// ── The step-2 gate ─────────────────────────────────────────────────────────

/**
 * Whether a corporate registrant has supplied the four values the owner ruling
 * requires (§3ج).
 *
 * This is what makes the fix real rather than optional: before it, «التالي»
 * advanced with every corporate field blank, which is how a row reaches the
 * database with nothing but a placeholder. Company type ONLY — a micro
 * registrant (بقالة / منشأة صغيرة) has no legal representative and is not
 * gated on one.
 */
export function isCorporateIdentityComplete(data: Record<string, string>): boolean {
  return (
    (data.companyName || "").trim().length > 0 &&
    normalizeCrNumber(data.crNumber).length > 0 &&
    (data.legalRepName || "").trim().length > 0 &&
    isLegalRepCapacity(data.legalRepCapacity)
  );
}

// ── The contract itself ─────────────────────────────────────────────────────

/**
 * Exactly the signup metadata keys the corporate branch of
 * `public.handle_new_user()` reads, after
 * `20260826_corporate_identity_persisted.sql`.
 *
 * `company_name` is the key that was missing and is the whole reason every
 * corporate row says «شركة جديدة».
 *
 * `company_name_en` is deliberately absent: this form has no English company
 * name field, and mirroring the Arabic name into it would be fabricated data.
 * The migration's corporate branch therefore falls back to `''` (the column's
 * own default) instead of the old «New Company» placeholder.
 *
 * An omitted key is better than an empty one — the trigger's COALESCE handles
 * absence, and an empty string would be a value the admin queue has to
 * special-case — so blank optional fields are dropped rather than sent as "".
 */
export function corporateSignupMetadata(data: Record<string, string>): Record<string, string> {
  const meta: Record<string, string> = { business_type: "corporate" };

  const companyName = (data.companyName || "").trim();
  if (companyName) meta.company_name = companyName;

  const cr = normalizeCrNumber(data.crNumber);
  if (cr) meta.cr_number = cr;

  const repName = (data.legalRepName || "").trim();
  if (repName) meta.legal_rep_name = repName;

  if (isLegalRepCapacity(data.legalRepCapacity)) {
    meta.legal_rep_capacity = data.legalRepCapacity;
  }

  return meta;
}

/**
 * The micro (منشأة صغيرة) equivalent.
 *
 * Same defect, different key: the micro branch of the trigger reads
 * `raw_user_meta_data->>'business_name'` and this form never sent it either,
 * so every micro row reads «نشاط تجاري جديد».
 *
 * `cr_number` is still sent even though `micro_profiles` has no column for it
 * — the value then at least survives in `auth.users.raw_user_meta_data` and is
 * recoverable later, exactly as the corporate CR turned out to be. Persisting
 * it properly needs a `micro_profiles.cr_number` column, which is outside this
 * change.
 */
export function microSignupMetadata(data: Record<string, string>): Record<string, string> {
  const meta: Record<string, string> = { business_type: "micro" };

  const businessName = (data.companyName || "").trim();
  if (businessName) meta.business_name = businessName;

  const cr = normalizeCrNumber(data.crNumber);
  if (cr) meta.cr_number = cr;

  return meta;
}
